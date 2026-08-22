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

pub struct DapSession {
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
    _child: Child,
    stdin: Arc<Mutex<Box<dyn Write + Send>>>,
    pending: PendingMap,
    next_seq: AtomicU32,
}

unsafe impl Send for DapSession {}
unsafe impl Sync for DapSession {}

#[allow(dead_code)]
impl DapSession {
    pub fn start(
        adapter_cmd: &str,
        adapter_args: &[String],
        session_id: u32,
        app: AppHandle,
    ) -> Result<Self, String> {
        // Same PATHEXT resolution the LSP client does, and for the same
        // reason: the adapter command is free text in the debugger panel, so
        // a user who types an npm-installed adapter (`js-debug-adapter`) hits
        // the `.cmd`-shim gap that `Command` alone cannot bridge on Windows.
        let program = crate::modules::tools::resolve_on_host(adapter_cmd)
            .unwrap_or_else(|| std::path::PathBuf::from(adapter_cmd));
        let mut cmd = proc::command(&program);
        cmd.args(adapter_args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("dap: failed to start '{adapter_cmd}': {e}"))?;

        // Tree-kill guard, set up before anything can fail out of this
        // function. See the `_job` field for why `kill()` alone is not enough
        // once a `.cmd` shim is in play.
        #[cfg(windows)]
        let job = match crate::modules::job::ProcessJob::create_for(child.id()) {
            Ok(j) => Some(j),
            Err(e) => {
                log::warn!("dap job-object setup failed for pid={}: {e}", child.id());
                None
            }
        };

        let stdin = child.stdin.take().ok_or("dap: no stdin")?;
        let stdout = child.stdout.take().ok_or("dap: no stdout")?;

        let stdin = Arc::new(Mutex::new(Box::new(stdin) as Box<dyn Write + Send>));
        let pending: PendingMap = Arc::new(Mutex::new(HashMap::new()));

        {
            let pending = pending.clone();
            thread::spawn(move || {
                reader_loop(BufReader::new(stdout), pending, app, session_id);
            });
        }

        Ok(Self {
            #[cfg(windows)]
            _job: job,
            _child: child,
            stdin,
            pending,
            next_seq: AtomicU32::new(1),
        })
    }

    pub fn request_blocking(
        &self,
        command: String,
        arguments: Option<Value>,
    ) -> Result<Value, String> {
        let seq = self.next_seq.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = mpsc::sync_channel(1);
        // Poison recovery on the shared pending/stdin mutexes (pitfall #8
        // pattern): a panicked reader thread must not brick every later request.
        self.pending
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(seq, tx);

        let msg = json!({
            "seq": seq,
            "type": "request",
            "command": command,
            "arguments": arguments
        });

        if let Err(e) = self.send_message(&msg) {
            self.pending
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remove(&seq);
            return Err(e);
        }

        rx.recv_timeout(Duration::from_secs(30))
            .map_err(|e| format!("dap timeout ({e})"))?
    }

    fn send_message(&self, msg: &Value) -> Result<(), String> {
        let body = serde_json::to_string(msg).map_err(|e| e.to_string())?;
        let header = format!("Content-Length: {}\r\n\r\n", body.len());
        let mut buf = header.into_bytes();
        buf.extend_from_slice(body.as_bytes());
        let mut w = self.stdin.lock().unwrap_or_else(|e| e.into_inner());
        w.write_all(&buf).map_err(|e| e.to_string())?;
        w.flush().map_err(|e| e.to_string())
    }

    /// Perform the DAP initialization handshake. Call after `start`.
    pub fn initialize(&self, adapter_id: &str) -> Result<Value, String> {
        self.request_blocking(
            "initialize".to_string(),
            Some(json!({
                "adapterID": adapter_id,
                "clientID": "nexis",
                "clientName": "Nexis",
                "linesStartAt1": true,
                "columnsStartAt1": true,
                "pathFormat": "path",
                "supportsVariableType": true,
                "supportsVariablePaging": false,
                "supportsRunInTerminalRequest": false,
                "supportsMemoryReferences": false,
                "supportsProgressReporting": true,
                "supportsInvalidatedEvent": true
            })),
        )
    }

    pub fn launch(&self, config: Value) -> Result<Value, String> {
        self.request_blocking("launch".to_string(), Some(config))
    }

    pub fn attach(&self, config: Value) -> Result<Value, String> {
        self.request_blocking("attach".to_string(), Some(config))
    }

    pub fn configuration_done(&self) -> Result<Value, String> {
        self.request_blocking("configurationDone".to_string(), None)
    }

    pub fn set_breakpoints(&self, source_path: &str, lines: &[u32]) -> Result<Value, String> {
        self.request_blocking(
            "setBreakpoints".to_string(),
            Some(json!({
                "source": { "path": source_path },
                "breakpoints": lines.iter().map(|&l| json!({ "line": l })).collect::<Vec<_>>()
            })),
        )
    }

    pub fn continue_thread(&self, thread_id: i64) -> Result<Value, String> {
        self.request_blocking(
            "continue".to_string(),
            Some(json!({ "threadId": thread_id })),
        )
    }

    pub fn next(&self, thread_id: i64) -> Result<Value, String> {
        self.request_blocking(
            "next".to_string(),
            Some(json!({ "threadId": thread_id, "granularity": "statement" })),
        )
    }

    pub fn step_in(&self, thread_id: i64) -> Result<Value, String> {
        self.request_blocking(
            "stepIn".to_string(),
            Some(json!({ "threadId": thread_id, "granularity": "statement" })),
        )
    }

    pub fn step_out(&self, thread_id: i64) -> Result<Value, String> {
        self.request_blocking(
            "stepOut".to_string(),
            Some(json!({ "threadId": thread_id })),
        )
    }

    pub fn pause(&self, thread_id: i64) -> Result<Value, String> {
        self.request_blocking("pause".to_string(), Some(json!({ "threadId": thread_id })))
    }

    pub fn disconnect(&self) -> Result<Value, String> {
        self.request_blocking(
            "disconnect".to_string(),
            Some(json!({ "terminateDebuggee": true })),
        )
    }

    pub fn stack_trace(&self, thread_id: i64) -> Result<Value, String> {
        self.request_blocking(
            "stackTrace".to_string(),
            Some(json!({ "threadId": thread_id })),
        )
    }

    pub fn scopes(&self, frame_id: i64) -> Result<Value, String> {
        self.request_blocking("scopes".to_string(), Some(json!({ "frameId": frame_id })))
    }

    pub fn variables(&self, variables_reference: i64) -> Result<Value, String> {
        self.request_blocking(
            "variables".to_string(),
            Some(json!({ "variablesReference": variables_reference })),
        )
    }

    pub fn evaluate(&self, expression: &str, frame_id: Option<i64>) -> Result<Value, String> {
        self.request_blocking(
            "evaluate".to_string(),
            Some(json!({
                "expression": expression,
                "frameId": frame_id,
                "context": "repl"
            })),
        )
    }
}

impl Drop for DapSession {
    fn drop(&mut self) {
        let _ = self.disconnect();
        let _ = self._child.kill();
        // Reap, so the killed adapter does not linger as a zombie.
        let _ = self._child.wait();
    }
}

// ── Reader thread ─────────────────────────────────────────────────────────────

fn reader_loop<R: Read>(
    mut reader: BufReader<R>,
    pending: PendingMap,
    app: AppHandle,
    session_id: u32,
) {
    loop {
        let mut content_length: Option<usize> = None;

        loop {
            let mut line = String::new();
            match read_line(&mut reader, &mut line) {
                Ok(0) => return,
                Ok(_) => {}
                Err(_) => return,
            }
            let trimmed = line.trim();
            if trimmed.is_empty() {
                break;
            }
            if let Some(v) = trimmed.strip_prefix("Content-Length: ") {
                if let Ok(n) = v.trim().parse::<usize>() {
                    content_length = Some(n);
                }
            }
        }

        // Cap the declared body size so a malformed or hostile Content-Length
        // from the debug adapter can't trigger a multi-GB allocation (which
        // would OOM-abort the app under panic="abort").
        const MAX_MESSAGE_BYTES: usize = 64 * 1024 * 1024;
        let len = match content_length {
            Some(n) if n <= MAX_MESSAGE_BYTES => n,
            Some(n) => {
                log::warn!(
                    "dap message of {n} bytes exceeds {MAX_MESSAGE_BYTES} cap; closing reader"
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

        dispatch(msg, &pending, &app, session_id);
    }
}

fn dispatch(msg: Value, pending: &PendingMap, app: &AppHandle, session_id: u32) {
    let msg_type = msg.get("type").and_then(Value::as_str).unwrap_or("");

    match msg_type {
        "response" => {
            let req_seq = msg.get("request_seq").and_then(Value::as_u64).unwrap_or(0) as u32;
            if let Some(tx) = pending
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remove(&req_seq)
            {
                let success = msg.get("success").and_then(Value::as_bool).unwrap_or(false);
                let result = if success {
                    Ok(msg.get("body").cloned().unwrap_or(Value::Null))
                } else {
                    let msg_str = msg
                        .get("message")
                        .and_then(Value::as_str)
                        .unwrap_or("dap error")
                        .to_string();
                    Err(msg_str)
                };
                let _ = tx.send(result);
            }
        }
        "event" => {
            let event_name = msg
                .get("event")
                .and_then(Value::as_str)
                .unwrap_or("unknown");
            let body = msg.get("body").cloned().unwrap_or(Value::Null);
            let payload = json!({ "sessionId": session_id, "body": body });
            let _ = app.emit(&format!("dap:{event_name}"), payload);
        }
        _ => {}
    }
}

fn read_line<R: Read>(reader: &mut BufReader<R>, line: &mut String) -> std::io::Result<usize> {
    use std::io::BufRead;
    reader.read_line(line)
}
