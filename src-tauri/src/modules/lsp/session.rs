use std::collections::HashMap;
use std::io::{BufReader, Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

use crate::modules::proc::hide_console;

pub struct LspSession {
    /// Kept alive so stdin/stdout pipes stay open.
    _child: Child,
    stdin: Arc<Mutex<Box<dyn Write + Send>>>,
    pending: Arc<Mutex<HashMap<u32, mpsc::SyncSender<Result<Value, String>>>>>,
    next_request_id: AtomicU32,
    pub workspace_root: String,
}

// Safety: Child is Send on all platforms. All other fields are Arc<Mutex<...>>.
unsafe impl Send for LspSession {}
unsafe impl Sync for LspSession {}

impl LspSession {
    pub fn start(
        server_cmd: &str,
        server_args: &[String],
        workspace_root: &str,
        initialization_options: Option<Value>,
        app: AppHandle,
    ) -> Result<Self, String> {
        let mut cmd = Command::new(server_cmd);
        cmd.args(server_args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        hide_console(&mut cmd);

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("lsp: failed to start '{server_cmd}': {e}"))?;

        let stdin = child
            .stdin
            .take()
            .ok_or("lsp: no stdin pipe")?;
        let stdout = child
            .stdout
            .take()
            .ok_or("lsp: no stdout pipe")?;

        let stdin = Arc::new(Mutex::new(Box::new(stdin) as Box<dyn Write + Send>));
        let pending: Arc<Mutex<HashMap<u32, mpsc::SyncSender<Result<Value, String>>>>> =
            Arc::new(Mutex::new(HashMap::new()));

        {
            let pending = pending.clone();
            let workspace_root = workspace_root.to_string();
            thread::spawn(move || {
                reader_loop(BufReader::new(stdout), pending, app, workspace_root);
            });
        }

        let session = Self {
            _child: child,
            stdin,
            pending,
            next_request_id: AtomicU32::new(1),
            workspace_root: workspace_root.to_string(),
        };

        session.do_initialize(workspace_root, initialization_options)?;
        Ok(session)
    }

    pub fn request_blocking(
        &self,
        method: String,
        params: Option<Value>,
    ) -> Result<Value, String> {
        let id = self.next_request_id.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = mpsc::sync_channel(1);
        self.pending.lock().unwrap().insert(id, tx);

        let msg = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params
        });

        if let Err(e) = self.send_message(&msg) {
            self.pending.lock().unwrap().remove(&id);
            return Err(e);
        }

        rx.recv_timeout(Duration::from_secs(30))
            .map_err(|e| format!("lsp timeout ({e})"))?
    }

    pub fn notify(&self, method: String, params: Option<Value>) -> Result<(), String> {
        let msg = json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params
        });
        self.send_message(&msg)
    }

    fn send_message(&self, msg: &Value) -> Result<(), String> {
        let body = serde_json::to_string(msg).map_err(|e| e.to_string())?;
        let header = format!("Content-Length: {}\r\n\r\n", body.len());
        let mut buf = header.into_bytes();
        buf.extend_from_slice(body.as_bytes());
        let mut w = self.stdin.lock().unwrap();
        w.write_all(&buf).map_err(|e| e.to_string())?;
        w.flush().map_err(|e| e.to_string())
    }

    fn do_initialize(
        &self,
        workspace_root: &str,
        initialization_options: Option<Value>,
    ) -> Result<(), String> {
        let root_uri = path_to_uri(workspace_root);
        let name = workspace_root
            .replace('\\', "/")
            .split('/')
            .last()
            .unwrap_or("workspace")
            .to_string();

        let params = json!({
            "processId": std::process::id(),
            "rootUri": root_uri,
            "rootPath": workspace_root,
            "capabilities": {
                "textDocument": {
                    "synchronization": {
                        "dynamicRegistration": false,
                        "willSave": false,
                        "willSaveWaitUntil": false,
                        "didSave": true
                    },
                    "completion": {
                        "dynamicRegistration": false,
                        "completionItem": {
                            "snippetSupport": false,
                            "commitCharactersSupport": false,
                            "documentationFormat": ["plaintext", "markdown"],
                            "deprecatedSupport": false,
                            "preselectSupport": false
                        },
                        "completionItemKind": {
                            "valueSet": [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25]
                        },
                        "contextSupport": false
                    },
                    "hover": {
                        "dynamicRegistration": false,
                        "contentFormat": ["markdown", "plaintext"]
                    },
                    "definition": {
                        "dynamicRegistration": false,
                        "linkSupport": false
                    },
                    "references": {
                        "dynamicRegistration": false
                    },
                    "rename": {
                        "dynamicRegistration": false,
                        "prepareSupport": false
                    },
                    "codeAction": {
                        "dynamicRegistration": false,
                        "codeActionLiteralSupport": {
                            "codeActionKind": {
                                "valueSet": [
                                    "", "quickfix", "refactor", "refactor.extract",
                                    "refactor.inline", "refactor.rewrite", "source",
                                    "source.organizeImports"
                                ]
                            }
                        }
                    },
                    "publishDiagnostics": {
                        "relatedInformation": true
                    }
                },
                "workspace": {
                    "applyEdit": true,
                    "workspaceEdit": {
                        "documentChanges": true
                    },
                    "workspaceFolders": true,
                    "symbol": {
                        "dynamicRegistration": false
                    }
                }
            },
            "initializationOptions": initialization_options,
            "workspaceFolders": [{
                "uri": root_uri,
                "name": name
            }]
        });

        self.request_blocking("initialize".to_string(), Some(params))?;
        self.notify("initialized".to_string(), Some(json!({})))?;
        Ok(())
    }
}

impl Drop for LspSession {
    fn drop(&mut self) {
        // Best-effort graceful shutdown then kill.
        let _ = self.notify("exit".to_string(), None);
        let _ = self._child.kill();
    }
}

// ── Reader thread ─────────────────────────────────────────────────────────────

fn reader_loop<R: Read>(
    mut reader: BufReader<R>,
    pending: Arc<Mutex<HashMap<u32, mpsc::SyncSender<Result<Value, String>>>>>,
    app: AppHandle,
    workspace_root: String,
) {
    loop {
        // Parse Content-Length header(s)
        let mut content_length: Option<usize> = None;
        loop {
            let mut line = String::new();
            match read_line_crlf(&mut reader, &mut line) {
                Ok(0) => return, // EOF
                Ok(_) => {}
                Err(_) => return,
            }
            let trimmed = line.trim();
            if trimmed.is_empty() {
                break; // blank separator line
            }
            if let Some(val) = trimmed.strip_prefix("Content-Length: ") {
                if let Ok(n) = val.trim().parse::<usize>() {
                    content_length = Some(n);
                }
            }
        }

        let len = match content_length {
            Some(n) => n,
            None => continue,
        };

        let mut body = vec![0u8; len];
        if reader.read_exact(&mut body).is_err() {
            return;
        }

        let msg: Value = match serde_json::from_slice(&body) {
            Ok(v) => v,
            Err(_) => continue,
        };

        dispatch_message(msg, &pending, &app, &workspace_root);
    }
}

fn dispatch_message(
    msg: Value,
    pending: &Arc<Mutex<HashMap<u32, mpsc::SyncSender<Result<Value, String>>>>>,
    app: &AppHandle,
    workspace_root: &str,
) {
    // Response: has numeric "id"
    if let Some(id_val) = msg.get("id") {
        if let Some(id) = id_val.as_u64() {
            let id = id as u32;
            if let Some(tx) = pending.lock().unwrap().remove(&id) {
                let result = if let Some(err) = msg.get("error") {
                    Err(err
                        .get("message")
                        .and_then(Value::as_str)
                        .unwrap_or("lsp error")
                        .to_string())
                } else {
                    Ok(msg.get("result").cloned().unwrap_or(Value::Null))
                };
                let _ = tx.send(result);
                return;
            }
        }
    }

    // Notification: has "method" but no "id" (or id is null)
    if let Some(method) = msg.get("method").and_then(Value::as_str) {
        let params = msg.get("params").cloned().unwrap_or(Value::Null);
        let event_name = format!("lsp:{}", method.replace('/', ":"));
        let payload = json!({ "workspaceRoot": workspace_root, "params": params });
        let _ = app.emit(&event_name, payload);
    }
}

fn read_line_crlf<R: Read>(reader: &mut BufReader<R>, line: &mut String) -> std::io::Result<usize> {
    use std::io::BufRead;
    let n = reader.read_line(line)?;
    Ok(n)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

pub fn path_to_uri(path: &str) -> String {
    let normalized = path.replace('\\', "/");
    // Windows drive: C:/... → file:///C:/...
    if normalized.len() >= 2 && normalized.as_bytes()[1] == b':' {
        format!("file:///{}", percent_encode_path(&normalized))
    } else {
        format!("file://{}", percent_encode_path(&normalized))
    }
}

pub fn uri_to_path(uri: &str) -> String {
    let path = uri
        .strip_prefix("file:///")
        .or_else(|| uri.strip_prefix("file://"))
        .unwrap_or(uri);
    let decoded = percent_decode(path);
    // Windows: /C:/foo → C:/foo
    let fixed = if decoded.starts_with('/') && decoded.len() >= 3 && decoded.as_bytes()[2] == b':' {
        decoded[1..].to_string()
    } else {
        decoded
    };
    // Normalise to backslashes on Windows
    #[cfg(windows)]
    return fixed.replace('/', "\\");
    #[cfg(not(windows))]
    return fixed;
}

fn percent_encode_path(s: &str) -> String {
    s.chars()
        .flat_map(|c| {
            let should_encode = matches!(c, ' ' | '#' | '?' | '[' | ']' | '@' | '!' | '$' | '&'
                | '\'' | '(' | ')' | '*' | '+' | ',' | ';' | '=' | '%');
            if should_encode {
                let mut buf = [0u8; 4];
                let len = c.encode_utf8(&mut buf).len();
                buf[..len]
                    .iter()
                    .map(|b| format!("%{:02X}", b))
                    .collect::<String>()
                    .chars()
                    .collect::<Vec<char>>()
            } else {
                vec![c]
            }
        })
        .collect()
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Ok(hi), Ok(lo)) = (
                std::str::from_utf8(&[bytes[i + 1]]).map(|s| u8::from_str_radix(s, 16)),
                std::str::from_utf8(&[bytes[i + 2]]).map(|s| u8::from_str_radix(s, 16)),
            ) {
                if let (Ok(hi), Ok(lo)) = (hi, lo) {
                    out.push((hi << 4) | lo);
                    i += 3;
                    continue;
                }
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}
