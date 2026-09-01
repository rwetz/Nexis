// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Panic-lint gate: no `.unwrap()`/`.expect()` in production code here.
// Tests may still panic (allow-*-in-tests in clippy.toml). CI's
// `clippy -- -D warnings` turns a new one into a build failure.
#![warn(clippy::unwrap_used, clippy::expect_used)]

/*!
 * http_share — a minimal TCP server that serves an HTML page on a local port
 * so users can open the current AI conversation or terminal snapshot in a
 * browser on the same LAN.
 *
 * v2: added Server-Sent Events (SSE) endpoint at /stream for live terminal
 * streaming — no external crates, uses std::net + std::thread + mpsc only.
 *
 * v3: added WebSocket endpoint at /ws so live terminal viewing pushes
 * instantly instead of on the ~2 s SSE cadence. Still stdlib-only — the
 * RFC 6455 handshake (SHA-1 + base64) and framing are implemented inline.
 * /stream remains as a fallback for clients without WebSocket support.
 *
 * v4: every route now requires a per-session token (`?k=<token>` — generated
 * frontend-side, compared constant-time) so possession of the link, not mere
 * LAN presence, is what grants viewing. The listener can also bind a caller-
 * chosen address (all interfaces / localhost / one specific IP) instead of
 * unconditional 0.0.0.0.
 */
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{IpAddr, SocketAddr, TcpListener};
use std::str::FromStr;
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;

// ── Server handle ────────────────────────────────────────────────────────────

/// A handle to connected live-stream clients (SSE and WebSocket alike).
/// Each entry is a SyncSender<String>. When a client disconnects the send
/// fails and the entry is pruned on the next broadcast.
type StreamClients = Arc<Mutex<Vec<mpsc::SyncSender<String>>>>;

struct RunningServer {
    content: Arc<Mutex<String>>,
    shutdown: Arc<Mutex<bool>>,
    port: u16,
    stream_clients: StreamClients,
}

impl RunningServer {
    fn start(html: String, desired_port: u16, bind: IpAddr, token: String) -> Result<Self, String> {
        validate_token(&token)?;
        let listener = TcpListener::bind(SocketAddr::new(bind, desired_port))
            .map_err(|e| format!("bind: {e}"))?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();

        let content = Arc::new(Mutex::new(html));
        let shutdown = Arc::new(Mutex::new(false));
        let stream_clients: StreamClients = Arc::new(Mutex::new(Vec::new()));
        let token: Arc<str> = token.into();

        let content_clone = Arc::clone(&content);
        let shutdown_clone = Arc::clone(&shutdown);
        let stream_clients_clone = Arc::clone(&stream_clients);

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
                            // Accepted sockets inherit the listener's
                            // non-blocking mode on Windows. Reset it, or
                            // per-connection reads (request headers, WS
                            // ping/close frames) fail instantly with
                            // WouldBlock instead of waiting for bytes.
                            let _ = stream.set_nonblocking(false);
                            let content_snap = Arc::clone(&content_clone);
                            let shutdown_snap = Arc::clone(&shutdown_clone);
                            let clients_snap = Arc::clone(&stream_clients_clone);
                            let token_snap = Arc::clone(&token);
                            thread::spawn(move || {
                                handle_connection(
                                    stream,
                                    content_snap,
                                    shutdown_snap,
                                    clients_snap,
                                    token_snap,
                                );
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
            stream_clients,
        })
    }

    fn update(&self, html: String) {
        if let Ok(mut g) = self.content.lock() {
            *g = html;
        }
    }

    /// Push a data string to every connected live-stream client (SSE + WS).
    /// Disconnected clients (send error) are pruned automatically.
    fn broadcast(&self, data: String) {
        if let Ok(mut clients) = self.stream_clients.lock() {
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

/// The frontend generates the token (crypto.getRandomValues, 32 hex chars);
/// this floor exists so a bug there can't silently start an effectively
/// unauthenticated server with a guessable one-char token. Fail closed.
fn validate_token(token: &str) -> Result<(), String> {
    if token.len() < 16 {
        return Err("share token too short (min 16 chars)".into());
    }
    if !token.bytes().all(|b| b.is_ascii_alphanumeric()) {
        return Err("share token must be ASCII alphanumeric".into());
    }
    Ok(())
}

/// Constant-time byte comparison — a plain `==` short-circuits on the first
/// mismatching byte, which leaks prefix-match timing to a LAN attacker
/// guessing the token. Length is not secret.
fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Split a request line ("GET /path?query HTTP/1.1") into (path, query).
/// Returns None for anything that isn't a well-formed GET.
fn parse_get_target(request_line: &str) -> Option<(&str, &str)> {
    let mut parts = request_line.split_whitespace();
    if parts.next()? != "GET" {
        return None;
    }
    let target = parts.next()?;
    Some(match target.split_once('?') {
        Some((path, query)) => (path, query),
        None => (target, ""),
    })
}

/// Extract the `k` parameter from a query string. No percent-decoding: valid
/// tokens are ASCII alphanumeric, so an encoded token simply won't match.
fn query_token(query: &str) -> Option<&str> {
    query.split('&').find_map(|pair| pair.strip_prefix("k="))
}

/// Read the request line, check the share token, dispatch to the right handler.
fn handle_connection(
    stream: std::net::TcpStream,
    content: Arc<Mutex<String>>,
    shutdown: Arc<Mutex<bool>>,
    stream_clients: StreamClients,
    token: Arc<str>,
) {
    // Clone the stream so we can have a BufReader for the request and keep the
    // original for writing the response.
    let cloned = match stream.try_clone() {
        Ok(s) => s,
        Err(_) => return,
    };
    // Bound the total request header bytes — defends against an unbounded
    // read_line() OOM from a hostile client on the LAN.
    //
    // Note for /ws: this BufReader may in principle buffer bytes past the
    // header terminator, which would be lost when we switch to reading frames
    // from `stream`. In practice that can't happen — RFC 6455 clients don't
    // send frames until they've received the 101 response.
    let mut reader = BufReader::new(cloned.take(MAX_REQUEST_HEADER_BYTES));

    // Read the request line (first line)
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).is_err() {
        return;
    }

    // Drain the rest of the headers, keeping the one the WS handshake needs.
    let mut ws_key: Option<String> = None;
    loop {
        let mut line = String::new();
        match reader.read_line(&mut line) {
            Ok(0) | Err(_) => return,
            Ok(_) => {
                if line == "\r\n" || line == "\n" {
                    break;
                }
                if let Some((name, value)) = line.split_once(':') {
                    if name.trim().eq_ignore_ascii_case("sec-websocket-key") {
                        ws_key = Some(value.trim().to_string());
                    }
                }
            }
        }
    }

    // Parse the target and gate EVERY route on the share token. A request
    // without the token learns nothing about what is being shared — not even
    // whether it's a conversation or a terminal.
    let Some((path, query)) = parse_get_target(&request_line) else {
        serve_bad_request(stream, "malformed request");
        return;
    };
    let authorized = query_token(query)
        .map(|k| ct_eq(k.as_bytes(), token.as_bytes()))
        .unwrap_or(false);
    if !authorized {
        serve_forbidden(stream);
        return;
    }

    // Route by path
    if path == "/ws" {
        match ws_key {
            Some(key) => serve_ws(stream, &key, shutdown, stream_clients),
            None => serve_bad_request(stream, "missing Sec-WebSocket-Key"),
        }
    } else if path == "/stream" {
        serve_sse(stream, shutdown, stream_clients);
    } else {
        let html = content.lock().map(|g| g.clone()).unwrap_or_default();
        serve_html(stream, html);
    }
}

/// Reject a malformed upgrade request and close.
fn serve_bad_request(mut stream: std::net::TcpStream, reason: &str) {
    let response = format!(
        "HTTP/1.1 400 Bad Request\r\n\
         Content-Type: text/plain\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n\
         \r\n\
         {reason}",
        reason.len()
    );
    let _ = stream.write_all(response.as_bytes());
}

/// Reject a request whose share token is missing or wrong.
fn serve_forbidden(mut stream: std::net::TcpStream) {
    let body = "This share link is invalid or has expired. \
                Ask the person sharing for the current link.";
    let response = format!(
        "HTTP/1.1 403 Forbidden\r\n\
         Content-Type: text/plain\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n\
         \r\n\
         {body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
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
fn serve_sse(
    mut stream: std::net::TcpStream,
    shutdown: Arc<Mutex<bool>>,
    stream_clients: StreamClients,
) {
    // Register this client
    let (tx, rx) = mpsc::sync_channel::<String>(32);
    {
        if let Ok(mut clients) = stream_clients.lock() {
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

// ── WebSocket (RFC 6455, stdlib-only) ────────────────────────────────────────

/// Magic GUID appended to the client key for the handshake accept hash.
const WS_GUID: &str = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

/// Largest client frame we accept. Viewers are read-only; anything beyond a
/// close/ping payload is suspicious, so cap well below memory-pressure sizes.
const MAX_WS_CLIENT_FRAME: u64 = 64 * 1024;

const WS_OP_TEXT: u8 = 0x1;
const WS_OP_CLOSE: u8 = 0x8;
const WS_OP_PING: u8 = 0x9;
const WS_OP_PONG: u8 = 0xA;

/// Minimal SHA-1 — only used for the WebSocket handshake, which mandates it.
/// (Not a security boundary; RFC 6455 uses it purely as a protocol check.)
fn sha1(data: &[u8]) -> [u8; 20] {
    let mut h: [u32; 5] = [
        0x6745_2301,
        0xEFCD_AB89,
        0x98BA_DCFE,
        0x1032_5476,
        0xC3D2_E1F0,
    ];
    let bit_len = (data.len() as u64).wrapping_mul(8);

    let mut msg = data.to_vec();
    msg.push(0x80);
    while msg.len() % 64 != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&bit_len.to_be_bytes());

    for chunk in msg.as_chunks::<64>().0 {
        let mut w = [0u32; 80];
        for (i, word) in chunk.as_chunks::<4>().0.iter().enumerate() {
            w[i] = u32::from_be_bytes(*word);
        }
        for i in 16..80 {
            w[i] = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]).rotate_left(1);
        }

        let (mut a, mut b, mut c, mut d, mut e) = (h[0], h[1], h[2], h[3], h[4]);
        for (i, &wi) in w.iter().enumerate() {
            let (f, k) = match i {
                0..=19 => ((b & c) | (!b & d), 0x5A82_7999u32),
                20..=39 => (b ^ c ^ d, 0x6ED9_EBA1),
                40..=59 => ((b & c) | (b & d) | (c & d), 0x8F1B_BCDC),
                _ => (b ^ c ^ d, 0xCA62_C1D6),
            };
            let tmp = a
                .rotate_left(5)
                .wrapping_add(f)
                .wrapping_add(e)
                .wrapping_add(k)
                .wrapping_add(wi);
            e = d;
            d = c;
            c = b.rotate_left(30);
            b = a;
            a = tmp;
        }

        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
    }

    let mut out = [0u8; 20];
    for (i, v) in h.iter().enumerate() {
        out[4 * i..4 * i + 4].copy_from_slice(&v.to_be_bytes());
    }
    out
}

fn base64_encode(data: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b0 = u32::from(chunk[0]);
        let b1 = u32::from(chunk.get(1).copied().unwrap_or(0));
        let b2 = u32::from(chunk.get(2).copied().unwrap_or(0));
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[(n >> 18) as usize & 63] as char);
        out.push(TABLE[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 {
            TABLE[(n >> 6) as usize & 63] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[n as usize & 63] as char
        } else {
            '='
        });
    }
    out
}

/// Sec-WebSocket-Accept value for a client's Sec-WebSocket-Key.
fn ws_accept_key(client_key: &str) -> String {
    let mut input = client_key.as_bytes().to_vec();
    input.extend_from_slice(WS_GUID.as_bytes());
    base64_encode(&sha1(&input))
}

/// Write one server→client frame (servers never mask).
fn write_ws_frame<W: Write>(w: &mut W, opcode: u8, payload: &[u8]) -> std::io::Result<()> {
    let mut header = Vec::with_capacity(10);
    header.push(0x80 | (opcode & 0x0F)); // FIN + opcode
    let len = payload.len();
    if len < 126 {
        header.push(len as u8);
    } else if len <= usize::from(u16::MAX) {
        header.push(126);
        header.extend_from_slice(&(len as u16).to_be_bytes());
    } else {
        header.push(127);
        header.extend_from_slice(&(len as u64).to_be_bytes());
    }
    w.write_all(&header)?;
    w.write_all(payload)?;
    w.flush()
}

/// Read one client→server frame, unmasking the payload. Returns (opcode, payload).
fn read_ws_frame<R: Read>(r: &mut R) -> std::io::Result<(u8, Vec<u8>)> {
    let mut hdr = [0u8; 2];
    r.read_exact(&mut hdr)?;
    let opcode = hdr[0] & 0x0F;
    let masked = hdr[1] & 0x80 != 0;
    let mut len = u64::from(hdr[1] & 0x7F);
    if len == 126 {
        let mut ext = [0u8; 2];
        r.read_exact(&mut ext)?;
        len = u64::from(u16::from_be_bytes(ext));
    } else if len == 127 {
        let mut ext = [0u8; 8];
        r.read_exact(&mut ext)?;
        len = u64::from_be_bytes(ext);
    }
    if len > MAX_WS_CLIENT_FRAME {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "ws frame too large",
        ));
    }
    let mut mask = [0u8; 4];
    if masked {
        r.read_exact(&mut mask)?;
    }
    let mut payload = vec![0u8; len as usize];
    r.read_exact(&mut payload)?;
    if masked {
        for (i, b) in payload.iter_mut().enumerate() {
            *b ^= mask[i % 4];
        }
    }
    Ok((opcode, payload))
}

/// Complete the WS handshake, then stream broadcast data as text frames until
/// shutdown or disconnect. The view is read-only: client text/binary frames
/// are ignored by design (no auth exists on this LAN server, so remote input
/// must not reach the terminal). Ping and close are answered per spec.
fn serve_ws(
    stream: std::net::TcpStream,
    client_key: &str,
    shutdown: Arc<Mutex<bool>>,
    stream_clients: StreamClients,
) {
    let reader_stream = match stream.try_clone() {
        Ok(s) => s,
        Err(_) => return,
    };
    // Both the broadcast loop (this thread) and the ping/close handler (reader
    // thread) write frames; the mutex keeps frames from interleaving.
    let writer = Arc::new(Mutex::new(stream));

    // Register for broadcasts BEFORE the 101 goes out: once the client has
    // read the handshake response it must not be able to miss a push.
    let (tx, rx) = mpsc::sync_channel::<String>(32);
    if let Ok(mut clients) = stream_clients.lock() {
        clients.push(tx);
    }

    let response = format!(
        "HTTP/1.1 101 Switching Protocols\r\n\
         Upgrade: websocket\r\n\
         Connection: Upgrade\r\n\
         Sec-WebSocket-Accept: {}\r\n\
         \r\n",
        ws_accept_key(client_key)
    );
    {
        let Ok(mut w) = writer.lock() else { return };
        if w.write_all(response.as_bytes()).is_err() || w.flush().is_err() {
            return;
        }
    }

    // Reader side: answer pings, honor close, ignore everything else.
    {
        let writer = Arc::clone(&writer);
        let mut rs = reader_stream;
        thread::spawn(move || loop {
            match read_ws_frame(&mut rs) {
                Ok((WS_OP_PING, payload)) => {
                    let Ok(mut w) = writer.lock() else { break };
                    if write_ws_frame(&mut *w, WS_OP_PONG, &payload).is_err() {
                        break;
                    }
                }
                Ok((WS_OP_CLOSE, _)) => {
                    if let Ok(mut w) = writer.lock() {
                        let _ = write_ws_frame(&mut *w, WS_OP_CLOSE, &[]);
                    }
                    let _ = rs.shutdown(std::net::Shutdown::Both);
                    break;
                }
                Ok(_) => {} // view-only: drop client data frames
                Err(_) => break,
            }
        });
    }

    // Writer side: push broadcasts; ping as keepalive on idle.
    loop {
        if shutdown.lock().map(|g| *g).unwrap_or(true) {
            break;
        }
        match rx.recv_timeout(Duration::from_secs(15)) {
            Ok(data) => {
                let Ok(mut w) = writer.lock() else { break };
                if write_ws_frame(&mut *w, WS_OP_TEXT, data.as_bytes()).is_err() {
                    break;
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                let Ok(mut w) = writer.lock() else { break };
                if write_ws_frame(&mut *w, WS_OP_PING, b"keepalive").is_err() {
                    break;
                }
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }

    if let Ok(mut w) = writer.lock() {
        let _ = write_ws_frame(&mut *w, WS_OP_CLOSE, &[]);
    };
}

// ── Tauri managed state ──────────────────────────────────────────────────────

#[derive(Default)]
pub struct HttpShareState {
    server: Mutex<Option<RunningServer>>,
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Start (or restart) the share server with the given HTML content.
/// Pass `port = 0` to auto-assign a free port. `bind` is the address to
/// listen on — omitted means all interfaces (0.0.0.0); pass "127.0.0.1" to
/// restrict viewing to this machine, or one interface's IP to expose only
/// that network. `token` is the per-session view token every request must
/// present as `?k=<token>` (generated frontend-side, validated here).
/// Returns the actual port number the server is listening on.
#[tauri::command]
pub fn http_share_start(
    html: String,
    port: u16,
    bind: Option<String>,
    token: String,
    state: tauri::State<'_, HttpShareState>,
) -> Result<u16, String> {
    let bind_ip = match bind.as_deref() {
        None | Some("") => IpAddr::from_str("0.0.0.0").map_err(|e| e.to_string())?,
        Some(s) => IpAddr::from_str(s).map_err(|_| format!("invalid bind address: {s}"))?,
    };
    if let Ok(mut guard) = state.server.lock() {
        if let Some(srv) = guard.take() {
            srv.stop();
        }
        let srv = RunningServer::start(html, port, bind_ip, token)?;
        let actual_port = srv.port();
        *guard = Some(srv);
        Ok(actual_port)
    } else {
        Err("state mutex poisoned".into())
    }
}

/// Best-effort primary LAN IP of this machine, for display in the share URL.
/// The UDP "connect" performs only a local route lookup — no packet is sent.
/// Returns None when offline or when the primary route is loopback (the
/// frontend then falls back to placeholder text). On multi-homed machines
/// (VPN up, several NICs) this is the default-route interface — a display
/// hint, not an authority on reachability.
#[tauri::command]
pub fn http_share_lan_ip() -> Option<String> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let ip = socket.local_addr().ok()?.ip();
    if ip.is_loopback() || ip.is_unspecified() {
        return None;
    }
    Some(ip.to_string())
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

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(bytes: &[u8]) -> String {
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    }

    #[test]
    fn sha1_known_vectors() {
        assert_eq!(hex(&sha1(b"")), "da39a3ee5e6b4b0d3255bfef95601890afd80709");
        assert_eq!(
            hex(&sha1(b"abc")),
            "a9993e364706816aba3e25717850c26c9cd0d89d"
        );
        assert_eq!(
            hex(&sha1(
                b"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"
            )),
            "84983e441c3bd26ebaae4aa1f95129e5e54670f1"
        );
        // > one 64-byte block
        assert_eq!(
            hex(&sha1(&[b'a'; 100])),
            "7f9000257a4918d7072655ea468540cdcbd42e0c"
        );
    }

    #[test]
    fn base64_known_vectors() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn ws_accept_key_rfc6455_example() {
        // The worked example from RFC 6455 §1.3.
        assert_eq!(
            ws_accept_key("dGhlIHNhbXBsZSBub25jZQ=="),
            "s3pPLMBiTxaQ9kYGzzhZRbK+xOo="
        );
    }

    #[test]
    fn ws_frame_server_write_parses_back() {
        // Server frames are unmasked; read_ws_frame handles both.
        for payload in [
            vec![b'x'; 5],   // 7-bit length
            vec![b'y'; 300], // 16-bit extended length
        ] {
            let mut buf = Vec::new();
            write_ws_frame(&mut buf, WS_OP_TEXT, &payload).unwrap();
            let (op, out) = read_ws_frame(&mut buf.as_slice()).unwrap();
            assert_eq!(op, WS_OP_TEXT);
            assert_eq!(out, payload);
        }
    }

    #[test]
    fn ws_frame_unmasks_client_payload() {
        // Hand-built masked client frame: "Hello" with mask 0x37 0xfa 0x21 0x3d
        // (the RFC 6455 §5.7 example).
        let frame: &[u8] = &[
            0x81, 0x85, 0x37, 0xfa, 0x21, 0x3d, 0x7f, 0x9f, 0x4d, 0x51, 0x58,
        ];
        let (op, payload) = read_ws_frame(&mut &frame[..]).unwrap();
        assert_eq!(op, WS_OP_TEXT);
        assert_eq!(payload, b"Hello");
    }

    #[test]
    fn ws_frame_rejects_oversized() {
        let mut buf = Vec::new();
        buf.push(0x81);
        buf.push(127); // 64-bit extended length
        buf.extend_from_slice(&(MAX_WS_CLIENT_FRAME + 1).to_be_bytes());
        assert!(read_ws_frame(&mut buf.as_slice()).is_err());
    }

    #[test]
    fn ws_frame_length_encoding_boundaries() {
        // 125 = last 7-bit length, 126 = first 16-bit, 65535 = last 16-bit,
        // 65536 = first 64-bit (and exactly the client cap, so it must pass).
        for len in [125usize, 126, 65535, 65536] {
            let payload = vec![b'z'; len];
            let mut buf = Vec::new();
            write_ws_frame(&mut buf, WS_OP_TEXT, &payload).unwrap();
            let (op, out) = read_ws_frame(&mut buf.as_slice()).unwrap();
            assert_eq!(op, WS_OP_TEXT, "len {len}");
            assert_eq!(out.len(), len, "len {len}");
        }
    }

    #[test]
    fn ct_eq_semantics() {
        assert!(ct_eq(b"tokentokentoken1", b"tokentokentoken1"));
        assert!(!ct_eq(b"tokentokentoken1", b"tokentokentoken2"));
        assert!(!ct_eq(b"short", b"longerthanshort"));
        assert!(ct_eq(b"", b""));
    }

    #[test]
    fn token_validation_fails_closed() {
        assert!(validate_token("abcDEF0123456789").is_ok());
        assert!(validate_token("tooshort").is_err());
        // Long enough but non-alphanumeric (would break URL embedding and
        // could smuggle query/header syntax) → rejected.
        assert!(validate_token("abcDEF0123456789&x=1").is_err());
        assert!(validate_token("").is_err());
    }

    #[test]
    fn get_target_parsing() {
        assert_eq!(
            parse_get_target("GET /ws?k=abc HTTP/1.1\r\n"),
            Some(("/ws", "k=abc"))
        );
        assert_eq!(parse_get_target("GET / HTTP/1.1\r\n"), Some(("/", "")));
        assert_eq!(parse_get_target("POST / HTTP/1.1\r\n"), None);
        assert_eq!(parse_get_target("garbage"), None);
        assert_eq!(query_token("a=1&k=tok&b=2"), Some("tok"));
        assert_eq!(query_token("kk=nope"), None);
        assert_eq!(query_token(""), None);
    }

    // ── Loopback integration ──────────────────────────────────────────────

    use std::io::{BufRead, BufReader};
    use std::net::TcpStream;

    const TEST_TOKEN: &str = "testtokentesttoken00";

    fn start_srv(html: &str) -> RunningServer {
        RunningServer::start(
            html.into(),
            0,
            IpAddr::from_str("127.0.0.1").unwrap(),
            TEST_TOKEN.into(),
        )
        .expect("start")
    }

    fn connect(port: u16) -> TcpStream {
        let s = TcpStream::connect(("127.0.0.1", port)).expect("connect");
        s.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        s
    }

    /// Read HTTP status line + headers; return (status_line, headers_text).
    fn read_http_head(reader: &mut impl BufRead) -> (String, String) {
        let mut status = String::new();
        reader.read_line(&mut status).expect("status line");
        let mut headers = String::new();
        loop {
            let mut line = String::new();
            reader.read_line(&mut line).expect("header line");
            if line == "\r\n" || line == "\n" {
                break;
            }
            headers.push_str(&line);
        }
        (status, headers)
    }

    #[test]
    fn loopback_serves_html_and_live_updates() {
        let srv = start_srv("<html>one</html>");
        let port = srv.port();

        let mut stream = connect(port);
        stream
            .write_all(format!("GET /?k={TEST_TOKEN} HTTP/1.1\r\nHost: x\r\n\r\n").as_bytes())
            .unwrap();
        let mut reader = BufReader::new(stream.try_clone().unwrap());
        let (status, headers) = read_http_head(&mut reader);
        assert!(status.starts_with("HTTP/1.1 200"), "got: {status}");
        assert!(headers.to_lowercase().contains("content-type: text/html"));
        let mut body = String::new();
        reader.read_to_string(&mut body).unwrap(); // Connection: close
        assert_eq!(body, "<html>one</html>");

        srv.update("<html>two</html>".into());
        let mut stream = connect(port);
        stream
            .write_all(format!("GET /?k={TEST_TOKEN} HTTP/1.1\r\nHost: x\r\n\r\n").as_bytes())
            .unwrap();
        let mut reader = BufReader::new(stream);
        let _ = read_http_head(&mut reader);
        let mut body = String::new();
        reader.read_to_string(&mut body).unwrap();
        assert_eq!(body, "<html>two</html>");

        srv.stop();
    }

    #[test]
    fn loopback_missing_or_wrong_token_is_403_with_no_content() {
        let srv = start_srv("<html>SECRET-CONTENT</html>");
        let port = srv.port();

        // No token, wrong token, and prefix-of-token on every route — all 403,
        // and the shared HTML must never appear in the response.
        for req in [
            "GET / HTTP/1.1\r\nHost: x\r\n\r\n".to_string(),
            "GET /?k=wrongwrongwrongwrong HTTP/1.1\r\nHost: x\r\n\r\n".to_string(),
            format!("GET /?k={} HTTP/1.1\r\nHost: x\r\n\r\n", &TEST_TOKEN[..16]),
            "GET /stream HTTP/1.1\r\nHost: x\r\n\r\n".to_string(),
            "GET /ws HTTP/1.1\r\nHost: x\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n"
                .to_string(),
        ] {
            let mut stream = connect(port);
            stream.write_all(req.as_bytes()).unwrap();
            let mut reader = BufReader::new(stream);
            let (status, _) = read_http_head(&mut reader);
            assert!(
                status.starts_with("HTTP/1.1 403"),
                "req {req:?} got: {status}"
            );
            let mut body = String::new();
            reader.read_to_string(&mut body).unwrap();
            assert!(
                !body.contains("SECRET-CONTENT"),
                "req {req:?} leaked content"
            );
        }

        srv.stop();
    }

    #[test]
    fn loopback_token_reaches_all_routes() {
        // /stream with the token answers 200 with SSE headers.
        let srv = start_srv("x");
        let port = srv.port();

        let mut stream = connect(port);
        stream
            .write_all(format!("GET /stream?k={TEST_TOKEN} HTTP/1.1\r\nHost: x\r\n\r\n").as_bytes())
            .unwrap();
        let mut reader = BufReader::new(stream.try_clone().unwrap());
        let (status, headers) = read_http_head(&mut reader);
        assert!(status.starts_with("HTTP/1.1 200"), "got: {status}");
        assert!(headers.to_lowercase().contains("text/event-stream"));

        srv.stop();
    }

    #[test]
    fn start_rejects_weak_tokens() {
        let ip = IpAddr::from_str("127.0.0.1").unwrap();
        assert!(RunningServer::start("x".into(), 0, ip, "short".into()).is_err());
        assert!(RunningServer::start("x".into(), 0, ip, "has spaces in it yes".into()).is_err());
    }

    #[test]
    fn loopback_ws_handshake_and_broadcast() {
        let srv = start_srv("x");
        let port = srv.port();

        let mut stream = connect(port);
        stream
            .write_all(
                format!(
                    "GET /ws?k={TEST_TOKEN} HTTP/1.1\r\n\
                     Host: x\r\n\
                     Upgrade: websocket\r\n\
                     Connection: Upgrade\r\n\
                     Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\
                     Sec-WebSocket-Version: 13\r\n\r\n"
                )
                .as_bytes(),
            )
            .unwrap();

        let mut reader = BufReader::new(stream.try_clone().unwrap());
        let (status, headers) = read_http_head(&mut reader);
        assert!(status.starts_with("HTTP/1.1 101"), "got: {status}");
        // RFC 6455 §1.3 worked example — proves the accept-key path end to end.
        assert!(
            headers.contains("Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo="),
            "got headers: {headers}"
        );

        // Registration happens before the 101 is written, so a broadcast now
        // must reach this client.
        srv.broadcast("hello viewer".into());
        let (op, payload) = read_ws_frame(&mut reader).expect("broadcast frame");
        assert_eq!(op, WS_OP_TEXT);
        assert_eq!(payload, b"hello viewer");

        // Send a masked close; the server must answer with a close frame.
        let close = [0x88u8, 0x80, 0x00, 0x00, 0x00, 0x00]; // masked, empty
        stream.write_all(&close).unwrap();
        let (op, _) = read_ws_frame(&mut reader).expect("close reply");
        assert_eq!(op, WS_OP_CLOSE);

        srv.stop();
    }

    #[test]
    fn loopback_ws_without_key_is_rejected() {
        let srv = start_srv("x");
        let port = srv.port();

        let mut stream = connect(port);
        stream
            .write_all(format!("GET /ws?k={TEST_TOKEN} HTTP/1.1\r\nHost: x\r\n\r\n").as_bytes())
            .unwrap();
        let mut reader = BufReader::new(stream);
        let (status, _) = read_http_head(&mut reader);
        assert!(status.starts_with("HTTP/1.1 400"), "got: {status}");

        srv.stop();
    }
}
