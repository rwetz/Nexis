//! Deep links into Nexis from its companion apps (`nexis://...`).
//!
//! Nexis Epoch and Nexis talk through one small, dependency-free channel
//! instead of an OS URL-scheme registration:
//!
//! * A running Nexis listens on a loopback port and writes that port, plus a
//!   random token, to `<local data dir>/nexis/links/nexis.json`. Epoch does the
//!   same in `.../links/epoch.json`. The folder is per user; the token keeps
//!   other local users (who can reach the port) from sending links.
//! * To follow a link, the sender reads the receiver's file, connects, and
//!   writes one JSON line `{"token": "...", "url": "nexis://..."}`. If nothing
//!   answers, it launches the app with `--link <url>` instead.
//!
//! Why not `tauri-plugin-deep-link`: it needs single-instance to route a link
//! to the window that is already open, and Nexis deliberately allows several
//! instances (one per project, `nexis <folder>`). Here a plain launch stays
//! exactly as it was; only a launch carrying a link is forwarded and exits.
//!
//! Links only *select* things: a tool to open and the project, run, model or
//! dataset to show in it. The webview still asks before acting on a path
//! outside the open workspace (window/deepLinks.ts).

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::hash::{BuildHasher, Hasher};
use std::io::{BufRead, BufReader, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

pub const SCHEME: &str = "nexis";
/// The tools a link may open. Ids, never display names, so a rename
/// (lib/toolNames.ts) never breaks a link.
const TOOLS: &[&str] = &["ml-lab", "benchmark"];
/// Parameters that name a file or folder: must be absolute, no `..`.
const PATH_PARAMS: &[&str] = &["project", "model", "dataset"];
/// Parameters that name a run id.
const ID_PARAMS: &[&str] = &["run"];

/// The event the main window listens for (window/deepLinks.ts).
pub const LINK_EVENT: &str = "nexis://link";

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct NexisLink {
    pub tool: String,
    pub params: BTreeMap<String, String>,
}

/// Parse and validate one `nexis://<tool>?key=value` link. Anything unknown
/// or malformed is rejected whole rather than half-applied.
pub fn parse(raw: &str) -> Option<NexisLink> {
    let url = tauri::Url::parse(raw.trim()).ok()?;
    if !url.scheme().eq_ignore_ascii_case(SCHEME) {
        return None;
    }
    let tool = url.host_str()?.to_ascii_lowercase();
    if !TOOLS.contains(&tool.as_str()) {
        return None;
    }
    let mut params = BTreeMap::new();
    for (key, value) in url.query_pairs() {
        let (key, value) = (key.into_owned(), value.into_owned());
        if PATH_PARAMS.contains(&key.as_str()) {
            if !is_safe_absolute(&value) {
                return None;
            }
        } else if ID_PARAMS.contains(&key.as_str()) {
            if !is_run_id(&value) {
                return None;
            }
        } else {
            return None;
        }
        params.insert(key, value);
    }
    Some(NexisLink { tool, params })
}

fn is_safe_absolute(value: &str) -> bool {
    let path = Path::new(value);
    !value.is_empty()
        && value.len() < 4096
        && path.is_absolute()
        && !path
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
}

fn is_run_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

/// The link carried by this process's own command line, if any: `--link <url>`
/// or a bare `nexis://...` argument.
pub fn link_from_args<I: IntoIterator<Item = String>>(args: I) -> Option<String> {
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        if arg == "--link" {
            return args.next();
        }
        if let Some(rest) = arg.strip_prefix("--link=") {
            return Some(rest.to_string());
        }
        if arg.to_ascii_lowercase().starts_with("nexis://") {
            return Some(arg);
        }
    }
    None
}

// ── the endpoint file ───────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct Endpoint {
    pub port: u16,
    pub token: String,
    pub pid: u32,
}

/// `<local data dir>/nexis/links/<app>.json`, shared by the Nexis family.
pub fn endpoint_path(app: &str) -> Option<PathBuf> {
    Some(
        dirs::data_local_dir()?
            .join("nexis")
            .join("links")
            .join(format!("{app}.json")),
    )
}

fn random_token() -> String {
    // Two independently seeded std hashers (each RandomState draws from the
    // OS RNG once per process) give 128 bits without another dependency.
    let mut out = String::with_capacity(32);
    for salt in 0..2u64 {
        let mut h = std::collections::hash_map::RandomState::new().build_hasher();
        h.write_u64(salt);
        h.write_u128(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or_default(),
        );
        h.write_u32(std::process::id());
        out.push_str(&format!("{:016x}", h.finish()));
    }
    out
}

/// Send `url` to the running app named `app`. `Ok(())` means it accepted it.
pub fn send(app: &str, url: &str) -> Result<(), String> {
    let path = endpoint_path(app).ok_or("no local data dir")?;
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let ep: Endpoint = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let addr = SocketAddr::from(([127, 0, 0, 1], ep.port));
    let mut stream =
        TcpStream::connect_timeout(&addr, Duration::from_millis(600)).map_err(|e| e.to_string())?;
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|e| e.to_string())?;
    let line = serde_json::json!({ "token": ep.token, "url": url }).to_string();
    stream
        .write_all(format!("{line}\n").as_bytes())
        .map_err(|e| e.to_string())?;
    let mut reply = String::new();
    BufReader::new(stream)
        .read_line(&mut reply)
        .map_err(|e| e.to_string())?;
    if reply.trim() == "ok" {
        Ok(())
    } else {
        Err(format!("refused: {}", reply.trim()))
    }
}

// ── receiving ───────────────────────────────────────────────────────────────

/// Links that arrived before the main window was listening.
#[derive(Default)]
pub struct PendingLinks(pub Mutex<Vec<NexisLink>>);

fn queue(app: &AppHandle, link: NexisLink) {
    if let Some(state) = app.try_state::<PendingLinks>() {
        state.0.lock().unwrap_or_else(|e| e.into_inner()).push(link);
    }
    // The payload is only a nudge to drain the queue; the queue is the source
    // of truth so a link that lands before the listener is not lost.
    let _ = app.emit_to("main", LINK_EVENT, ());
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

/// Queue the link this process was launched with (if it was not forwarded).
pub fn queue_launch_link(app: &AppHandle, url: &str) {
    match parse(url) {
        Some(link) => queue(app, link),
        None => log::warn!("[links] ignoring malformed launch link"),
    }
}

/// Listen for links from companion apps for the life of the process.
pub fn start_listener(app: AppHandle) {
    let Some(path) = endpoint_path("nexis") else {
        return;
    };
    let listener = match TcpListener::bind(("127.0.0.1", 0)) {
        Ok(l) => l,
        Err(e) => {
            log::warn!("[links] could not listen: {e}");
            return;
        }
    };
    let Ok(port) = listener.local_addr().map(|a| a.port()) else {
        return;
    };
    let token = random_token();
    let ep = Endpoint {
        port,
        token: token.clone(),
        pid: std::process::id(),
    };
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    // Write-then-rename so a sender never reads half a file.
    let tmp = path.with_extension("json.tmp");
    let written = serde_json::to_string(&ep)
        .ok()
        .and_then(|s| std::fs::write(&tmp, s).ok())
        .and_then(|_| std::fs::rename(&tmp, &path).ok());
    if written.is_none() {
        log::warn!("[links] could not write {}", path.display());
        return;
    }
    let spawned = std::thread::Builder::new()
        .name("nexis-links".into())
        .spawn(move || {
            for stream in listener.incoming().flatten() {
                handle_conn(&app, stream, &token);
            }
        });
    if let Err(e) = spawned {
        log::warn!("[links] listener thread: {e}");
    }
}

#[derive(Deserialize)]
struct Message {
    token: String,
    url: String,
}

fn handle_conn(app: &AppHandle, stream: TcpStream, token: &str) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let mut reader = BufReader::new(&stream);
    let mut line = String::new();
    if reader.read_line(&mut line).is_err() || line.len() > 16 * 1024 {
        return;
    }
    let reply = match serde_json::from_str::<Message>(&line) {
        Ok(msg) if msg.token == token => match parse(&msg.url) {
            Some(link) => {
                queue(app, link);
                "ok"
            }
            None => "err bad-link",
        },
        Ok(_) => "err token",
        Err(_) => "err format",
    };
    let mut out = &stream;
    let _ = out.write_all(format!("{reply}\n").as_bytes());
}

/// The webview drains queued links (on mount, and on every `nexis://link`).
#[tauri::command]
pub fn links_take_pending(state: State<'_, PendingLinks>) -> Vec<NexisLink> {
    std::mem::take(&mut *state.0.lock().unwrap_or_else(|e| e.into_inner()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn abs(p: &str) -> String {
        if cfg!(windows) {
            format!("C:\\{}", p.replace('/', "\\"))
        } else {
            format!("/{p}")
        }
    }

    fn url(tool: &str, pairs: &[(&str, &str)]) -> String {
        let mut u = tauri::Url::parse(&format!("nexis://{tool}")).unwrap();
        for (k, v) in pairs {
            u.query_pairs_mut().append_pair(k, v);
        }
        u.to_string()
    }

    #[test]
    fn parses_a_synapse_run_link() {
        let project = abs("work/plant-doctor");
        let link = parse(&url(
            "ml-lab",
            &[("project", &project), ("run", "2026-10-14-1737-tabular-2")],
        ))
        .unwrap();
        assert_eq!(link.tool, "ml-lab");
        assert_eq!(link.params["project"], project);
        assert_eq!(link.params["run"], "2026-10-14-1737-tabular-2");
    }

    #[test]
    fn rejects_unknown_tools_params_and_schemes() {
        assert!(parse(&url("terminal", &[])).is_none());
        assert!(parse(&url("ml-lab", &[("cmd", "rm")])).is_none());
        assert!(parse("https://ml-lab?project=/x").is_none());
        assert!(parse("not a url").is_none());
    }

    #[test]
    fn rejects_relative_and_traversing_paths() {
        assert!(parse(&url("benchmark", &[("model", "model.onnx")])).is_none());
        assert!(parse(&url("benchmark", &[("model", &abs("a/../b/model.onnx"))])).is_none());
        assert!(parse(&url("benchmark", &[("model", &abs("a/model.onnx"))])).is_some());
    }

    #[test]
    fn rejects_odd_run_ids() {
        let project = abs("p");
        assert!(parse(&url("ml-lab", &[("project", &project), ("run", "../x")])).is_none());
        assert!(parse(&url("ml-lab", &[("project", &project), ("run", "a b")])).is_none());
    }

    #[test]
    fn finds_the_link_argument() {
        let args = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(
            link_from_args(args(&["--link", "nexis://ml-lab"])).as_deref(),
            Some("nexis://ml-lab")
        );
        assert_eq!(
            link_from_args(args(&["--link=nexis://x"])).as_deref(),
            Some("nexis://x")
        );
        assert_eq!(
            link_from_args(args(&["C:\\proj", "NEXIS://benchmark"])).as_deref(),
            Some("NEXIS://benchmark")
        );
        assert_eq!(link_from_args(args(&["C:\\proj"])), None);
    }

    #[test]
    fn tokens_are_long_and_differ() {
        let (a, b) = (random_token(), random_token());
        assert_eq!(a.len(), 32);
        assert_ne!(a, b);
    }
}
