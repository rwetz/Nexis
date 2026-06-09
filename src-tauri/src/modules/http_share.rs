// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/*!
 * http_share — a minimal TCP server that serves an HTML page on a local port
 * so users can open the current AI conversation or terminal snapshot in a
 * browser on the same LAN.
 *
 * v2: added Server-Sent Events (SSE) endpoint at /stream for live terminal
 * streaming — no external crates, uses std::net + std::thread + mpsc only.
 */
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;

// ── Server handle ────────────────────────────────────────────────────────────

/// A handle to connected SSE clients.  Each entry is a SyncSender<String>.
/// When a client disconnects the send fails and the entry is pruned on the
/// next broadcast.
type SseClients = Arc<Mutex<Vec<mpsc::SyncSender<String>>>>;

struct RunningServer {
    content: Arc<Mutex<String>>,
    shutdown: Arc<Mutex<bool>>,
    port: u16,
    sse_clients: SseClients,
}

impl RunningServer {
    fn start(html: String, desired_port: u16) -> Result<Self, String> {
        let bind_addr = if desired_port == 0 {
            "0.0.0.0:0".to_string()
        } else {
            format!("0.0.0.0:{desired_port}")
        };
        let listener = TcpListener::bind(&bind_addr).map_err(|e| format!("bind: {e}"))?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();

        let content = Arc::new(Mutex::new(html));
        let shutdown = Arc::new(Mutex::new(false));
        let sse_clients: SseClients = Arc::new(Mutex::new(Vec::new()));

        let content_clone = Arc::clone(&content);
        let shutdown_clone = Arc::clone(&shutdown);
        let sse_clients_clone = Arc::clone(&sse_clients);

        thread::Builder::new()
            .name("nexis-http-share".into())
            .spawn(move || {
                listener.set_nonblocking(true).ok();
                loop {
                    if shutdown_clone.lock().map(|g| *g).unwrap_or(true) {
                        break;
                    }
                    match listener.accept() {
                        Ok((stream, _)) => {
                            let content_snap = Arc::clone(&content_clone);
                            let shutdown_snap = Arc::clone(&shutdown_clone);
                            let sse_snap = Arc::clone(&sse_clients_clone);
                            thread::spawn(move || {
                                handle_connection(stream, content_snap, shutdown_snap, sse_snap);
                            });
                        }
                        Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                            thread::sleep(Duration::from_millis(60));
                        }
                        Err(_) => break,
                    }
                }
            })
            .map_err(|e| format!("spawn: {e}"))?;

        Ok(Self {
            content,
            shutdown,
            port,
            sse_clients,
        })
    }

    fn update(&self, html: String) {
        if let Ok(mut g) = self.content.lock() {
            *g = html;
        }
    }

    /// Push a data string to every connected SSE client.
    /// Disconnected clients (send error) are pruned automatically.
    fn broadcast(&self, data: String) {
        if let Ok(mut clients) = self.sse_clients.lock() {
            clients.retain(|tx| tx.try_send(data.clone()).is_ok());
        }
    }

    fn stop(&self) {
        if let Ok(mut g) = self.shutdown.lock() {
            *g = true;
        }
    }

    fn port(&self) -> u16 {
        self.port
    }
}

impl Drop for RunningServer {
    fn drop(&mut self) {
        self.stop();
    }
}

// ── HTTP connection handler ──────────────────────────────────────────────────

/// Cap on bytes read for a request's start-line + headers, so a malicious LAN
/// client can't OOM the server with an endless line or an unbounded header
/// stream. 64 KiB is far above any legitimate HTTP request header section.
const MAX_REQUEST_HEADER_BYTES: u64 = 64 * 1024;

/// Read the request line, dispatch to the right handler.
fn handle_connection(
    stream: std::net::TcpStream,
    content: Arc<Mutex<String>>,
    shutdown: Arc<Mutex<bool>>,
    sse_clients: SseClients,
) {
    // Clone the stream so we can have a BufReader for the request and keep the
    // original for writing the response.
    let cloned = match stream.try_clone() {
        Ok(s) => s,
        Err(_) => return,
    };
    // Bound the total request header bytes — defends against an unbounded
    // read_line() OOM from a hostile client on the LAN.
    let mut reader = BufReader::new(cloned.take(MAX_REQUEST_HEADER_BYTES));

    // Read the request line (first line)
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).is_err() {
        return;
    }

    // Drain the rest of the headers
    loop {
        let mut line = String::new();
        match reader.read_line(&mut line) {
            Ok(0) | Err(_) => return,
            Ok(_) => {
                if line == "\r\n" || line == "\n" {
                    break;
                }
            }
        }
    }

    // Route by path
    if request_line.contains("GET /stream") {
        serve_sse(stream, shutdown, sse_clients);
    } else {
        let html = content.lock().map(|g| g.clone()).unwrap_or_default();
        serve_html(stream, html);
    }
}

/// Serve a static HTML response and close.
fn serve_html(mut stream: std::net::TcpStream, html: String) {
    let body = html.as_bytes();
    let header = format!(
        "HTTP/1.1 200 OK\r\n\
         Content-Type: text/html; charset=utf-8\r\n\
         Content-Length: {}\r\n\
         Cache-Control: no-store\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Connection: close\r\n\
         \r\n",
        body.len()
    );
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(body);
}

/// Keep the connection open and stream SSE events until shutdown or disconnect.
fn serve_sse(mut stream: std::net::TcpStream, shutdown: Arc<Mutex<bool>>, sse_clients: SseClients) {
    // Register this client
    let (tx, rx) = mpsc::sync_channel::<String>(32);
    {
        if let Ok(mut clients) = sse_clients.lock() {
            clients.push(tx);
        }
    }

    // Write SSE headers
    let header = "HTTP/1.1 200 OK\r\n\
                  Content-Type: text/event-stream\r\n\
                  Cache-Control: no-cache\r\n\
                  Access-Control-Allow-Origin: *\r\n\
                  Connection: keep-alive\r\n\
                  \r\n";
    if stream.write_all(header.as_bytes()).is_err() {
        return;
    }

    // Event loop — 15 s keepalive comment, exit when shutdown or client gone
    loop {
        if shutdown.lock().map(|g| *g).unwrap_or(true) {
            break;
        }
        match rx.recv_timeout(Duration::from_secs(15)) {
            Ok(data) => {
                // data may be multi-line — escape newlines within each data field
                let escaped = data.replace('\n', "\\n").replace('\r', "");
                let event = format!("data: {escaped}\n\n");
                if stream.write_all(event.as_bytes()).is_err() || stream.flush().is_err() {
                    break; // client disconnected
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                // keepalive ping
                if stream.write_all(b": keepalive\n\n").is_err() || stream.flush().is_err() {
                    break;
                }
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
}

// ── Tauri managed state ──────────────────────────────────────────────────────

#[derive(Default)]
pub struct HttpShareState {
    server: Mutex<Option<RunningServer>>,
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Start (or restart) the share server with the given HTML content.
/// Pass `port = 0` to auto-assign a free port.
/// Returns the actual port number the server is listening on.
#[tauri::command]
pub fn http_share_start(
    html: String,
    port: u16,
    state: tauri::State<'_, HttpShareState>,
) -> Result<u16, String> {
    if let Ok(mut guard) = state.server.lock() {
        if let Some(srv) = guard.take() {
            srv.stop();
        }
        let srv = RunningServer::start(html, port)?;
        let actual_port = srv.port();
        *guard = Some(srv);
        Ok(actual_port)
    } else {
        Err("state mutex poisoned".into())
    }
}

/// Push updated HTML content to the already-running server without restarting.
#[tauri::command]
pub fn http_share_update(
    html: String,
    state: tauri::State<'_, HttpShareState>,
) -> Result<(), String> {
    state
        .server
        .lock()
        .map_err(|_| "mutex poisoned".to_string())?
        .as_ref()
        .ok_or_else(|| "server not running".to_string())?
        .update(html);
    Ok(())
}

/// Broadcast a raw SSE data string to all connected stream clients.
/// Use this to push live terminal output when the user has live mode active.
#[tauri::command]
pub fn http_share_push_stream(
    data: String,
    state: tauri::State<'_, HttpShareState>,
) -> Result<(), String> {
    let guard = state
        .server
        .lock()
        .map_err(|_| "mutex poisoned".to_string())?;
    if let Some(srv) = guard.as_ref() {
        srv.broadcast(data);
    }
    Ok(())
}

/// Stop the share server.
#[tauri::command]
pub fn http_share_stop(state: tauri::State<'_, HttpShareState>) -> Result<(), String> {
    let mut guard = state
        .server
        .lock()
        .map_err(|_| "mutex poisoned".to_string())?;
    if let Some(srv) = guard.take() {
        srv.stop();
    }
    Ok(())
}
