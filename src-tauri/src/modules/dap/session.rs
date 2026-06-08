// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

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

pub struct DapSession {
    _child: Child,
    stdin: Arc<Mutex<Box<dyn Write + Send>>>,
    pending: Arc<Mutex<HashMap<u32, mpsc::SyncSender<Result<Value, String>>>>>,
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
        let mut cmd = Command::new(adapter_cmd);
        cmd.args(adapter_args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        hide_console(&mut cmd);

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("dap: failed to start '{adapter_cmd}': {e}"))?;

        let stdin = child.stdin.take().ok_or("dap: no stdin")?;
        let stdout = child.stdout.take().ok_or("dap: no stdout")?;

        let stdin = Arc::new(Mutex::new(Box::new(stdin) as Box<dyn Write + Send>));
        let pending: Arc<Mutex<HashMap<u32, mpsc::SyncSender<Result<Value, String>>>>> =
            Arc::new(Mutex::new(HashMap::new()));

        {
            let pending = pending.clone();
            let app = app.clone();
            thread::spawn(move || {
                reader_loop(BufReader::new(stdout), pending, app, session_id);
            });
        }

        Ok(Self {
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
        self.pending.lock().unwrap().insert(seq, tx);

        let msg = json!({
            "seq": seq,
            "type": "request",
            "command": command,
            "arguments": arguments
        });

        if let Err(e) = self.send_message(&msg) {
            self.pending.lock().unwrap().remove(&seq);
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
        let mut w = self.stdin.lock().unwrap();
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
    }
}

// ── Reader thread ─────────────────────────────────────────────────────────────

fn reader_loop<R: Read>(
    mut reader: BufReader<R>,
    pending: Arc<Mutex<HashMap<u32, mpsc::SyncSender<Result<Value, String>>>>>,
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

        dispatch(msg, &pending, &app, session_id);
    }
}

fn dispatch(
    msg: Value,
    pending: &Arc<Mutex<HashMap<u32, mpsc::SyncSender<Result<Value, String>>>>>,
    app: &AppHandle,
    session_id: u32,
) {
    let msg_type = msg.get("type").and_then(Value::as_str).unwrap_or("");

    match msg_type {
        "response" => {
            let req_seq = msg.get("request_seq").and_then(Value::as_u64).unwrap_or(0) as u32;
            if let Some(tx) = pending.lock().unwrap().remove(&req_seq) {
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
