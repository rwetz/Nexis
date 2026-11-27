//! Open-PR counts for the github.com repos Atlas found, through the user's own
//! `gh` login.
//!
//! This is the one part of Atlas that talks to a network, and it is built to
//! be skippable at every step:
//!
//! - **Optional.** `github_prs = false` in `atlas.toml` means `gh` never runs.
//!   No `gh` on PATH, `gh` not logged in, or no network all come back as
//!   `available: false` with a reason, never as an error, so the scan and both
//!   views carry on exactly as before.
//! - **No token handling.** Atlas never reads, stores or passes a token; `gh`
//!   brings its own auth (its keychain entry, or `GH_TOKEN` if the user set
//!   one). Nothing here is written to disk.
//! - **Batched and cached.** One GraphQL query covers up to `BATCH` repos via
//!   aliases, and each repo's answer is kept in memory for `TTL`, so pressing
//!   refresh ten times costs one request, not ten. A failure is remembered for
//!   `FAILURE_BACKOFF` so an offline machine does not retry on every refresh.
//! - **Off the scan path.** The frontend asks for this after the scan lands,
//!   so a slow or hung `gh` delays a badge, never the list. `GH_TIMEOUT` caps
//!   how long that can be.

use crate::modules::atlas::health::valid_slug_part;
use crate::modules::proc::command as new_command;
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const TTL: Duration = Duration::from_secs(10 * 60);
const FAILURE_BACKOFF: Duration = Duration::from_secs(2 * 60);
const GH_TIMEOUT: Duration = Duration::from_secs(20);
/// Aliased `repository` lookups per query. Each asks for at most 100 PR
/// authors, which keeps one query far below GitHub's node limit.
const BATCH: usize = 25;

#[derive(Debug, Clone, Copy, Serialize, Default, PartialEq, Eq)]
pub struct PrCounts {
    pub total: u32,
    /// Opened by Dependabot. Split out because a Dependabot backlog is a
    /// "merge or close the bumps" chore, not a review queue.
    pub dependabot: u32,
    /// Everyone else, other bots included.
    pub human: u32,
}

#[derive(Debug, Serialize, Default)]
pub struct PrReport {
    /// False when the counts could not be fetched (disabled, no `gh`, not
    /// logged in, offline). `counts` may still hold cached answers then.
    pub available: bool,
    pub reason: Option<String>,
    /// Keyed by `owner/name`. A repo `gh` could not see (deleted, private to
    /// another account) is simply absent.
    pub counts: HashMap<String, PrCounts>,
    /// Unix seconds of the oldest answer in `counts`, for "as of" display.
    pub fetched_at: Option<i64>,
}

struct Entry {
    at: Instant,
    unix: i64,
    /// `None`: asked, and GitHub had no such repo for this login. Cached too,
    /// or a stale remote would be re-queried on every refresh.
    counts: Option<PrCounts>,
}

#[derive(Default)]
struct Cache {
    entries: HashMap<String, Entry>,
    failure: Option<(Instant, String)>,
}

static CACHE: LazyLock<Mutex<Cache>> = LazyLock::new(|| Mutex::new(Cache::default()));

/// Counts for `slugs`, from cache where fresh and from one batched `gh` call
/// per `BATCH` otherwise.
pub fn open_prs(slugs: &[String], enabled: bool) -> PrReport {
    if !enabled {
        return PrReport {
            reason: Some("disabled in atlas.toml (github_prs = false)".into()),
            ..Default::default()
        };
    }

    let mut seen = HashSet::new();
    let wanted: Vec<String> = slugs
        .iter()
        .filter(|s| is_valid_slug(s) && seen.insert(s.to_string()))
        .cloned()
        .collect();

    let (missing, backoff) = {
        let cache = CACHE.lock().unwrap_or_else(|e| e.into_inner());
        let missing: Vec<String> = wanted
            .iter()
            .filter(|s| cache.entries.get(*s).is_none_or(|e| e.at.elapsed() >= TTL))
            .cloned()
            .collect();
        let backoff = cache
            .failure
            .as_ref()
            .filter(|(at, _)| at.elapsed() < FAILURE_BACKOFF)
            .map(|(_, why)| why.clone());
        (missing, backoff)
    };

    // The lock is not held across the network call: a second refresh while
    // the first is in flight just finds the cache cold and asks too, which is
    // cheaper than blocking a Tauri worker behind `gh`.
    let mut failure = backoff;
    if failure.is_none() && !missing.is_empty() {
        failure = fetch_into_cache(&missing).err();
    }

    let cache = CACHE.lock().unwrap_or_else(|e| e.into_inner());
    let mut report = PrReport {
        available: failure.is_none(),
        reason: failure,
        ..Default::default()
    };
    for slug in &wanted {
        if let Some(Entry {
            unix,
            counts: Some(c),
            ..
        }) = cache.entries.get(slug)
        {
            report.counts.insert(slug.clone(), *c);
            report.fetched_at = Some(report.fetched_at.map_or(*unix, |t| t.min(*unix)));
        }
    }
    report
}

fn fetch_into_cache(missing: &[String]) -> Result<(), String> {
    let result = (|| {
        let gh = find_gh().ok_or("gh is not installed")?;
        let mut fetched = Vec::new();
        for chunk in missing.chunks(BATCH) {
            let body = run_gh(&gh, &build_query(chunk))?;
            fetched.push((chunk, parse_response(&body, chunk)?));
        }
        Ok::<_, String>(fetched)
    })();

    let mut cache = CACHE.lock().unwrap_or_else(|e| e.into_inner());
    match result {
        Ok(fetched) => {
            cache.failure = None;
            let at = Instant::now();
            let unix = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);
            for (chunk, counts) in fetched {
                for slug in chunk {
                    cache.entries.insert(
                        slug.clone(),
                        Entry {
                            at,
                            unix,
                            counts: counts.get(slug).copied(),
                        },
                    );
                }
            }
            Ok(())
        }
        Err(why) => {
            cache.failure = Some((Instant::now(), why.clone()));
            Err(why)
        }
    }
}

fn is_valid_slug(slug: &str) -> bool {
    slug.split_once('/')
        .is_some_and(|(o, n)| valid_slug_part(o) && valid_slug_part(n))
}

/// A GUI app launched from the Dock does not inherit the shell's PATH, so the
/// usual package-manager locations are tried after it.
fn find_gh() -> Option<PathBuf> {
    if let Some(p) = crate::modules::tools::resolve_on_host("gh") {
        return Some(p);
    }
    [
        "/opt/homebrew/bin/gh",
        "/usr/local/bin/gh",
        "/usr/bin/gh",
        "/home/linuxbrew/.linuxbrew/bin/gh",
    ]
    .into_iter()
    .map(PathBuf::from)
    .find(|p| p.is_file())
}

/// `gh api graphql` with a hard deadline. stdout and stderr are drained on
/// their own threads so a large response cannot fill a pipe and deadlock the
/// wait.
fn run_gh(gh: &PathBuf, query: &str) -> Result<Value, String> {
    let mut child = new_command(gh)
        .args(["api", "graphql", "--hostname", "github.com", "-f"])
        .arg(format!("query={query}"))
        .env("GH_PROMPT_DISABLED", "1")
        .env("GH_NO_UPDATE_NOTIFIER", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("could not run gh: {e}"))?;

    let drain = |pipe: Option<Box<dyn Read + Send>>| {
        std::thread::spawn(move || {
            let mut buf = Vec::new();
            if let Some(mut p) = pipe {
                let _ = p.read_to_end(&mut buf);
            }
            buf
        })
    };
    let out = drain(child.stdout.take().map(|p| Box::new(p) as _));
    let err = drain(child.stderr.take().map(|p| Box::new(p) as _));

    let deadline = Instant::now() + GH_TIMEOUT;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => {
                std::thread::sleep(Duration::from_millis(50));
            }
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("gh timed out".into());
            }
            Err(e) => return Err(format!("gh: {e}")),
        }
    };
    let stdout = out.join().unwrap_or_default();
    let stderr = err.join().unwrap_or_default();

    // A partial GraphQL answer (one repo not found) makes `gh` exit non-zero
    // but still print `data`, so the body decides, not the exit code.
    if let Ok(body) = serde_json::from_slice::<Value>(&stdout) {
        if body.get("data").is_some_and(|d| !d.is_null()) {
            return Ok(body);
        }
    }
    let msg = String::from_utf8_lossy(&stderr);
    let msg = msg.trim();
    Err(if msg.is_empty() {
        format!("gh exited with {status}")
    } else {
        // `gh auth login` advice and network errors are one line; keep it so.
        msg.lines().next().unwrap_or(msg).to_string()
    })
}

/// One aliased `repository` lookup per slug. Slugs are validated to GitHub's
/// own name alphabet before they get here (`is_valid_slug`), which is what
/// makes interpolating them into string literals safe.
fn build_query(slugs: &[String]) -> String {
    let mut q = String::from("query{");
    for (i, slug) in slugs.iter().enumerate() {
        let Some((owner, name)) = slug.split_once('/') else {
            continue;
        };
        q.push_str(&format!(
            "r{i}:repository(owner:\"{owner}\",name:\"{name}\")\
             {{pullRequests(states:OPEN,first:100){{totalCount nodes{{author{{login}}}}}}}}"
        ));
    }
    q.push('}');
    q
}

fn parse_response(body: &Value, slugs: &[String]) -> Result<HashMap<String, PrCounts>, String> {
    let data = body
        .get("data")
        .filter(|d| d.is_object())
        .ok_or("unexpected response from gh")?;
    let mut out = HashMap::new();
    for (i, slug) in slugs.iter().enumerate() {
        let Some(prs) = data
            .get(format!("r{i}"))
            .and_then(|r| r.get("pullRequests"))
        else {
            continue;
        };
        let total = prs.get("totalCount").and_then(Value::as_u64).unwrap_or(0) as u32;
        let dependabot = prs
            .get("nodes")
            .and_then(Value::as_array)
            .map(|nodes| {
                nodes
                    .iter()
                    .filter(|n| {
                        n.pointer("/author/login")
                            .and_then(Value::as_str)
                            .is_some_and(is_dependabot)
                    })
                    .count() as u32
            })
            .unwrap_or(0);
        // Past 100 open PRs only the first page was classified; the remainder
        // is counted as human rather than guessed at.
        let dependabot = dependabot.min(total);
        out.insert(
            slug.clone(),
            PrCounts {
                total,
                dependabot,
                human: total - dependabot,
            },
        );
    }
    Ok(out)
}

/// GraphQL reports the app's bot login as `dependabot`; older repos may still
/// carry PRs from `dependabot-preview`.
fn is_dependabot(login: &str) -> bool {
    let login = login.strip_prefix("app/").unwrap_or(login);
    login == "dependabot" || login == "dependabot[bot]" || login == "dependabot-preview"
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn slugs(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn query_aliases_every_repo_in_order() {
        let q = build_query(&slugs(&["rwetz/Nexis", "o/r.js"]));
        assert!(q.starts_with("query{r0:repository(owner:\"rwetz\",name:\"Nexis\")"));
        assert!(q.contains("r1:repository(owner:\"o\",name:\"r.js\")"));
        assert!(q.contains("pullRequests(states:OPEN,first:100)"));
        assert!(q.ends_with('}'));
        assert_eq!(q.matches('{').count(), q.matches('}').count());
    }

    #[test]
    fn splits_dependabot_from_everyone_else() {
        let body = json!({ "data": {
            "r0": { "pullRequests": { "totalCount": 4, "nodes": [
                { "author": { "login": "dependabot" } },
                { "author": { "login": "app/dependabot" } },
                { "author": { "login": "rwetz" } },
                { "author": null }
            ]}},
            "r1": null,
            "r2": { "pullRequests": { "totalCount": 0, "nodes": [] }}
        }});
        let got = parse_response(&body, &slugs(&["a/one", "a/missing", "a/empty"])).unwrap();
        assert_eq!(
            got.get("a/one"),
            Some(&PrCounts {
                total: 4,
                dependabot: 2,
                human: 2
            })
        );
        // A repo the login cannot see is absent rather than zero.
        assert!(!got.contains_key("a/missing"));
        assert_eq!(got.get("a/empty"), Some(&PrCounts::default()));
    }

    #[test]
    fn beyond_the_first_page_the_rest_counts_as_human() {
        let nodes: Vec<Value> = (0..100)
            .map(|_| json!({ "author": { "login": "dependabot" } }))
            .collect();
        let body = json!({ "data": { "r0": { "pullRequests": {
            "totalCount": 130, "nodes": nodes
        }}}});
        let got = parse_response(&body, &slugs(&["a/b"])).unwrap();
        assert_eq!(
            got["a/b"],
            PrCounts {
                total: 130,
                dependabot: 100,
                human: 30
            }
        );
    }

    #[test]
    fn a_body_without_data_is_an_error() {
        assert!(parse_response(&json!({ "errors": [] }), &slugs(&["a/b"])).is_err());
        assert!(parse_response(&json!({ "data": null }), &slugs(&["a/b"])).is_err());
    }

    #[test]
    fn disabled_never_runs_gh() {
        let r = open_prs(&slugs(&["a/b"]), false);
        assert!(!r.available);
        assert!(r.counts.is_empty());
        assert!(r.reason.unwrap().contains("github_prs"));
    }

    #[test]
    fn rejects_slugs_that_could_escape_the_query() {
        assert!(is_valid_slug("rwetz/nexis-atlas"));
        assert!(!is_valid_slug("rwetz"));
        assert!(!is_valid_slug("a/b\"){x}"));
        assert!(!is_valid_slug("a/b/c"));
        assert!(!is_valid_slug("/b"));
    }
}
