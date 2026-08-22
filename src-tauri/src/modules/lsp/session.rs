// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Panic-lint gate: no `.unwrap()`/`.expect()` in production code here.
// Tests may still panic (allow-*-in-tests in clippy.toml). CI's
// `clippy -- -D warnings` turns a new one into a build failure.
#![warn(clippy::unwrap_used, clippy::expect_used)]

use std::collections::HashMap;
use std::io::{BufReader, Read, Write};
use std::process::{Child, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

use crate::modules::proc;

type PendingMap = Arc<Mutex<HashMap<u32, mpsc::SyncSender<Result<Value, String>>>>>;

pub struct LspSession {
    /// Windows only: kills the whole process tree when the session drops.
    ///
    /// Load-bearing since programs are resolved before spawning. A server that
    /// resolves to a `.cmd` shim is run as `cmd.exe /d /c "<shim> ..."`, so
    /// `_child` is the wrapper and the server itself is a grandchild —
    /// `kill()` would terminate the wrapper and leave the server alive holding
    /// both pipe ends, so the reader thread never sees EOF and every restart
    /// leaks another orphan. Declared before `_child` so the Job closes first.
    #[cfg(windows)]
    _job: Option<crate::modules::job::ProcessJob>,
    /// Kept alive so stdin/stdout pipes stay open.
    _child: Child,
    stdin: Arc<Mutex<Box<dyn Write + Send>>>,
    pending: PendingMap,
    next_request_id: AtomicU32,
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
        // Resolve before spawning. `Command` on Windows only ever appends
        // `.exe` to a bare name, but every npm-installed server here lands as
        // a `.cmd` shim — so `vscode-css-language-server` fails to spawn even
        // though `tool_probe` (which does walk PATHEXT) reports it present.
        // That split made the missing-tools pill lie in both directions: it
        // cleared on refresh, then came straight back on the next open.
        // Falling back to the bare name keeps the failure path unchanged when
        // resolution finds nothing, so the error still comes from the spawn.
        let program = crate::modules::tools::resolve_on_host(server_cmd)
            .unwrap_or_else(|| std::path::PathBuf::from(server_cmd));
        let mut cmd = proc::command(&program);
        cmd.args(server_args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("lsp: failed to start '{server_cmd}': {e}"))?;

        // Tree-kill guard, set up before anything can fail out of this
        // function. See the `_job` field for why `kill()` alone is not enough
        // once a `.cmd` shim is in play.
        #[cfg(windows)]
        let job = match crate::modules::job::ProcessJob::create_for(child.id()) {
            Ok(j) => Some(j),
            Err(e) => {
                log::warn!("lsp job-object setup failed for pid={}: {e}", child.id());
                None
            }
        };

        let stdin = child.stdin.take().ok_or("lsp: no stdin pipe")?;
        let stdout = child.stdout.take().ok_or("lsp: no stdout pipe")?;

        let stdin = Arc::new(Mutex::new(Box::new(stdin) as Box<dyn Write + Send>));
        let pending: PendingMap = Arc::new(Mutex::new(HashMap::new()));

        {
            let pending = pending.clone();
            let stdin = stdin.clone();
            let workspace_root = workspace_root.to_string();
            thread::spawn(move || {
                reader_loop(BufReader::new(stdout), pending, stdin, app, workspace_root);
            });
        }

        let session = Self {
            #[cfg(windows)]
            _job: job,
            _child: child,
            stdin,
            pending,
            next_request_id: AtomicU32::new(1),
        };

        session.do_initialize(workspace_root, initialization_options)?;
        Ok(session)
    }

    pub fn request_blocking(&self, method: String, params: Option<Value>) -> Result<Value, String> {
        let id = self.next_request_id.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = mpsc::sync_channel(1);
        // Poison recovery on the shared pending/stdin mutexes (pitfall #8
        // pattern): a panicked reader thread must not brick every later request.
        self.pending
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(id, tx);

        let msg = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params
        });

        if let Err(e) = self.send_message(&msg) {
            self.pending
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remove(&id);
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
        write_message(&self.stdin, msg)
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
            .next_back()
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
                        },
                        "dataSupport": true,
                        "resolveSupport": {
                            "properties": ["edit"]
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
        // Best-effort graceful shutdown then kill. `wait` is not optional:
        // without it the killed child stays a zombie until the app exits, and
        // on Windows it is what releases the wrapper before the Job closes.
        let _ = self.notify("exit".to_string(), None);
        let _ = self._child.kill();
        let _ = self._child.wait();
    }
}

// ── Reader thread ─────────────────────────────────────────────────────────────

type SharedStdin = Arc<Mutex<Box<dyn Write + Send>>>;

/// Frame and write a JSON-RPC message to the server's stdin.
fn write_message(stdin: &Mutex<Box<dyn Write + Send>>, msg: &Value) -> Result<(), String> {
    let body = serde_json::to_string(msg).map_err(|e| e.to_string())?;
    let header = format!("Content-Length: {}\r\n\r\n", body.len());
    let mut buf = header.into_bytes();
    buf.extend_from_slice(body.as_bytes());
    let mut w = stdin.lock().unwrap_or_else(|e| e.into_inner());
    w.write_all(&buf).map_err(|e| e.to_string())?;
    w.flush().map_err(|e| e.to_string())
}

fn reader_loop<R: Read>(
    mut reader: BufReader<R>,
    pending: PendingMap,
    stdin: SharedStdin,
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

        // Cap the declared body size so a malformed or hostile Content-Length
        // from the language server can't trigger a multi-GB allocation (which
        // would OOM-abort the app under panic="abort").
        const MAX_MESSAGE_BYTES: usize = 64 * 1024 * 1024;
        let len = match content_length {
            Some(n) if n <= MAX_MESSAGE_BYTES => n,
            Some(n) => {
                log::warn!(
                    "lsp message of {n} bytes exceeds {MAX_MESSAGE_BYTES} cap; closing reader"
                );
                return;
            }
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

        dispatch_message(msg, &pending, &stdin, &app, &workspace_root);
    }
}

fn dispatch_message(
    msg: Value,
    pending: &PendingMap,
    stdin: &SharedStdin,
    app: &AppHandle,
    workspace_root: &str,
) {
    let has_method = msg.get("method").and_then(Value::as_str).is_some();
    let has_id = msg.get("id").map(|v| !v.is_null()).unwrap_or(false);

    // Server → client request: has both "method" and "id". These must be
    // answered or the server stalls waiting (e.g. rust-analyzer blocks an
    // executeCommand reply on the workspace/applyEdit response).
    if has_method && has_id {
        let method = msg.get("method").and_then(Value::as_str).unwrap_or("");
        let id = msg.get("id").cloned().unwrap_or(Value::Null);
        let params = msg.get("params").cloned().unwrap_or(Value::Null);

        let response = match method {
            "workspace/applyEdit" => {
                // Forward the edit to the frontend (which writes the files),
                // then ack. We ack optimistically — the LSP spec has no way
                // to report a deferred failure, and the frontend apply path
                // is the same one used for renames.
                let payload = json!({ "workspaceRoot": workspace_root, "params": params });
                let _ = app.emit("lsp:workspace:applyEdit", payload);
                json!({ "jsonrpc": "2.0", "id": id, "result": { "applied": true } })
            }
            "workspace/configuration" => {
                // Respond with one null per requested item — "no opinion".
                let count = params
                    .get("items")
                    .and_then(Value::as_array)
                    .map(|a| a.len())
                    .unwrap_or(0);
                json!({ "jsonrpc": "2.0", "id": id, "result": vec![Value::Null; count] })
            }
            "client/registerCapability"
            | "client/unregisterCapability"
            | "window/workDoneProgress/create"
            | "window/showMessageRequest" => {
                json!({ "jsonrpc": "2.0", "id": id, "result": Value::Null })
            }
            _ => {
                json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "error": { "code": -32601, "message": format!("method not found: {method}") }
                })
            }
        };
        if let Err(e) = write_message(stdin, &response) {
            log::warn!("lsp: failed to answer server request '{method}': {e}");
        }
        return;
    }

    // Response: has numeric "id"
    if let Some(id_val) = msg.get("id") {
        if let Some(id) = id_val.as_u64() {
            let id = id as u32;
            if let Some(tx) = pending
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remove(&id)
            {
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

fn percent_encode_path(s: &str) -> String {
    use std::fmt::Write;
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        let should_encode = matches!(
            c,
            ' ' | '#'
                | '?'
                | '['
                | ']'
                | '@'
                | '!'
                | '$'
                | '&'
                | '\''
                | '('
                | ')'
                | '*'
                | '+'
                | ','
                | ';'
                | '='
                | '%'
        );
        if should_encode {
            let mut buf = [0u8; 4];
            for b in c.encode_utf8(&mut buf).as_bytes() {
                let _ = write!(out, "%{b:02X}");
            }
        } else {
            out.push(c);
        }
    }
    out
}
