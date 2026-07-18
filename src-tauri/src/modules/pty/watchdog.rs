// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

//! PTY thread watchdog (pitfall #8 defense-in-depth). The failure being
//! guarded: a reader or flusher thread dies (panic, poisoned lock in new
//! code, driver bug) while the shell keeps running — the terminal goes
//! permanently silent with no error anywhere. Each I/O thread carries a
//! [`SetOnDrop`] sentinel that flips on any exit, panic included; one global
//! watchdog thread scans all registered sessions and, when a thread has been
//! dead past a grace period without the session's normal `done` handoff,
//! pushes a visible notice straight down the session's `on_data` IPC channel
//! — which still works with both PTY threads dead, because the channel goes
//! directly to the webview.
//!
//! Deliberately NOT surfaced as a fake exit event: the frontend auto-respawns
//! (or closes the pane) on shell exit, which would silently kill a child that
//! may still be running the user's work. A stalled terminal stays open with
//! an explanation; the user decides when to close it.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, Once};
use std::thread;
use std::time::{Duration, Instant};

use tauri::ipc::{Channel, Response};

const SCAN_INTERVAL: Duration = Duration::from_secs(5);
/// A dead thread must stay dead this long — with `done` still unset — before
/// we call it a stall. Covers the normal teardown window where the reader
/// hits EOF milliseconds before the waiter records the exit.
const STALL_GRACE: Duration = Duration::from_secs(5);

const STALL_NOTICE: &[u8] = b"\r\n\x1b[0m\x1b[31m[nexis: terminal stalled \
\xe2\x80\x94 an internal output thread died; the shell may still be running \
but its output can no longer be shown. Close and reopen this tab.]\x1b[0m\r\n";

/// Flips the flag on drop — including panic unwind — marking a PTY thread as
/// no longer running. Instantiate first thing inside the thread closure.
pub struct SetOnDrop(pub Arc<AtomicBool>);

impl Drop for SetOnDrop {
    fn drop(&mut self) {
        self.0.store(true, Ordering::Release);
    }
}

struct WatchEntry {
    reader_finished: Arc<AtomicBool>,
    flusher_finished: Arc<AtomicBool>,
    /// The waiter's normal end-of-session handoff; once set, thread exits
    /// are expected and the entry is pruned.
    done: Arc<AtomicBool>,
    /// When a dead thread was first observed; cleared if it turns out to be
    /// a teardown transient.
    bad_since: Option<Instant>,
    on_data: Channel<Response>,
}

static WATCHED: Mutex<Vec<WatchEntry>> = Mutex::new(Vec::new());
static WATCHDOG_START: Once = Once::new();

/// Register a session with the watchdog. Called once per `spawn()`; the
/// entry prunes itself when the session ends normally.
pub fn watch(
    reader_finished: Arc<AtomicBool>,
    flusher_finished: Arc<AtomicBool>,
    done: Arc<AtomicBool>,
    on_data: Channel<Response>,
) {
    WATCHED
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .push(WatchEntry {
            reader_finished,
            flusher_finished,
            done,
            bad_since: None,
            on_data,
        });
    WATCHDOG_START.call_once(|| {
        // Best-effort: a watchdog that can't start must not fail pty_open.
        if let Err(e) = thread::Builder::new()
            .name("nexis-pty-watchdog".into())
            .spawn(watchdog_loop)
        {
            log::warn!("pty watchdog thread failed to start: {e}");
        }
    });
}

fn watchdog_loop() {
    loop {
        thread::sleep(SCAN_INTERVAL);
        let now = Instant::now();
        let mut entries = WATCHED.lock().unwrap_or_else(|e| e.into_inner());
        entries.retain_mut(|entry| {
            let thread_dead = entry.reader_finished.load(Ordering::Acquire)
                || entry.flusher_finished.load(Ordering::Acquire);
            match assess(
                entry.done.load(Ordering::Acquire),
                thread_dead,
                &mut entry.bad_since,
                now,
                STALL_GRACE,
            ) {
                Verdict::Keep => true,
                Verdict::Prune => false,
                Verdict::Report => {
                    log::error!(
                        "pty watchdog: session stalled (reader dead: {}, flusher dead: {}) — surfacing notice",
                        entry.reader_finished.load(Ordering::Acquire),
                        entry.flusher_finished.load(Ordering::Acquire),
                    );
                    // Channel goes straight to the webview; ignore a closed one.
                    let _ = entry.on_data.send(Response::new(STALL_NOTICE.to_vec()));
                    false // report once, then stop watching
                }
            }
        });
    }
}

#[derive(Debug, PartialEq, Eq)]
enum Verdict {
    Keep,
    Prune,
    Report,
}

/// Pure decision core, factored out for tests. `bad_since` is the entry's
/// persistent first-observed-dead timestamp.
fn assess(
    done: bool,
    thread_dead: bool,
    bad_since: &mut Option<Instant>,
    now: Instant,
    grace: Duration,
) -> Verdict {
    if done {
        return Verdict::Prune;
    }
    if !thread_dead {
        *bad_since = None;
        return Verdict::Keep;
    }
    match *bad_since {
        None => {
            *bad_since = Some(now);
            Verdict::Keep
        }
        Some(t) if now.duration_since(t) >= grace => Verdict::Report,
        Some(_) => Verdict::Keep,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const GRACE: Duration = Duration::from_secs(5);

    #[test]
    fn healthy_session_is_kept_and_reset() {
        let now = Instant::now();
        let mut since = Some(now); // stale marker from a transient
        assert_eq!(assess(false, false, &mut since, now, GRACE), Verdict::Keep);
        assert_eq!(since, None, "recovery must clear the bad timestamp");
    }

    #[test]
    fn done_session_prunes_even_with_dead_threads() {
        let now = Instant::now();
        let mut since = None;
        assert_eq!(assess(true, true, &mut since, now, GRACE), Verdict::Prune);
    }

    #[test]
    fn dead_thread_reports_only_after_grace() {
        let t0 = Instant::now();
        let mut since = None;
        // First observation: arm the timestamp, don't report.
        assert_eq!(assess(false, true, &mut since, t0, GRACE), Verdict::Keep);
        assert_eq!(since, Some(t0));
        // Still within grace.
        let t1 = t0 + Duration::from_secs(4);
        assert_eq!(assess(false, true, &mut since, t1, GRACE), Verdict::Keep);
        // Past grace: report.
        let t2 = t0 + Duration::from_secs(5);
        assert_eq!(assess(false, true, &mut since, t2, GRACE), Verdict::Report);
    }

    #[test]
    fn teardown_transient_never_reports() {
        // Reader hits EOF (dead), waiter sets done a tick later — the entry
        // must prune, not report.
        let t0 = Instant::now();
        let mut since = None;
        assert_eq!(assess(false, true, &mut since, t0, GRACE), Verdict::Keep);
        let t1 = t0 + Duration::from_secs(6);
        assert_eq!(assess(true, true, &mut since, t1, GRACE), Verdict::Prune);
    }

    #[test]
    fn set_on_drop_fires_on_panic_unwind() {
        let flag = Arc::new(AtomicBool::new(false));
        let flag2 = flag.clone();
        let _ = std::panic::catch_unwind(move || {
            let _sentinel = SetOnDrop(flag2);
            panic!("simulated pty thread death");
        });
        assert!(flag.load(Ordering::Acquire), "sentinel must fire on panic");
    }
}
