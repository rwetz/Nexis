/*!
 * http_share — a minimal single-threaded TCP server that serves an HTML page
 * on a local port so users can open the current AI conversation (or a terminal
 * snapshot) in a browser on the same LAN.
 *
 * No external crates required — uses std::net and std::thread only.
 */
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

// ── Server handle ────────────────────────────────────────────────────────────

struct RunningServer {
    content: Arc<Mutex<String>>,
    shutdown: Arc<Mutex<bool>>,
    port: u16,
}

impl RunningServer {
    fn start(html: String, desired_port: u16) -> Result<Self, String> {
        let bind_addr = if desired_port == 0 {
            "127.0.0.1:0".to_string()
        } else {
            format!("0.0.0.0:{desired_port}")
        };
        let listener = TcpListener::bind(&bind_addr).map_err(|e| format!("bind: {e}"))?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();

        let content = Arc::new(Mutex::new(html));
        let shutdown = Arc::new(Mutex::new(false));

        let content_clone = Arc::clone(&content);
        let shutdown_clone = Arc::clone(&shutdown);

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
                            let html_snap = content_clone
                                .lock()
                                .map(|g| g.clone())
                                .unwrap_or_default();
                            thread::spawn(move || serve_one(stream, html_snap));
                        }
                        Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                            thread::sleep(Duration::from_millis(60));
                        }
                        Err(_) => break,
                    }
                }
            })
            .map_err(|e| format!("spawn: {e}"))?;

        Ok(Self { content, shutdown, port })
    }

    fn update(&self, html: String) {
        if let Ok(mut g) = self.content.lock() {
            *g = html;
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

// ── HTTP request handler ─────────────────────────────────────────────────────

fn serve_one(mut stream: std::net::TcpStream, html: String) {
    // Read and discard all request headers (stop at blank line)
    let mut reader = BufReader::new(&stream);
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

    let body = html.as_bytes();
    let header = format!(
        "HTTP/1.1 200 OK\r\n\
         Content-Type: text/html; charset=utf-8\r\n\
         Content-Length: {}\r\n\
         Cache-Control: no-store\r\n\
         Connection: close\r\n\
         \r\n",
        body.len()
    );
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(body);
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
    // Stop any running server first
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

/// Stop the share server.
#[tauri::command]
pub fn http_share_stop(state: tauri::State<'_, HttpShareState>) -> Result<(), String> {
    let mut guard = state.server.lock().map_err(|_| "mutex poisoned".to_string())?;
    if let Some(srv) = guard.take() {
        srv.stop();
    }
    Ok(())
}
