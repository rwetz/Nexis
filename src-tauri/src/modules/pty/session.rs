// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use portable_pty::{native_pty_system, ChildKiller, MasterPty, PtySize};
use tauri::ipc::{Channel, Response};

use super::da_filter::DaFilter;
use super::shell_init;
use super::watchdog;
use crate::modules::workspace::WorkspaceEnv;

// Flusher coalesces a short window after first-byte arrival so we send chunks,
// not single bytes. MAX_IDLE is only a safety net for missed signals.
const FLUSH_COALESCE: Duration = Duration::from_millis(4);
const FLUSH_MAX_IDLE: Duration = Duration::from_millis(50);
const READ_BUF: usize = 16 * 1024;
// Cap on buffered-but-not-yet-flushed bytes. On overflow we discard the
// entire pending buffer and emit an SGR-reset + notice in its place.
// Dropping a partial prefix would slice a CSI sequence in half and corrupt
// xterm's screen state. 4 MiB is ~1000 full 80x24 screens.
const MAX_PENDING: usize = 4 * 1024 * 1024;
// Hard reset (ESC c) + dim notice. Written verbatim into the stream when
// we're forced to discard backlog.
const OVERFLOW_NOTICE: &[u8] =
    b"\x1bc\x1b[2m[nexis: dropped output due to backpressure]\x1b[0m\r\n";

pub struct Session {
    // Field drop order is intentional. Rust drops fields top-to-bottom:
    //   1. `_job` — on Windows, closing the Job HANDLE fires
    //      KILL_ON_JOB_CLOSE, terminating the pwsh tree before the master
    //      pipe drops. Without this, ClosePseudoConsole in `master`'s Drop
    //      can block waiting for conhost to drain pending output, freezing
    //      the Tauri worker thread that triggered the close.
    //   2. `killer` — best-effort kill (redundant on Windows once Job
    //      closed, but harmless and required on Unix where there is no Job).
    //   3. `writer` — closes the input side of the master pipe.
    //   4. `master` — last; ClosePseudoConsole on Windows. By now the child
    //      is dead and conhost has nothing left to drain.
    #[cfg(windows)]
    _job: Option<super::job::PtyJob>,
    pub killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    /// FIFO input queue drained by the dedicated writer thread. `pty_write`
    /// enqueues here (never blocks); the thread does the actual pipe write,
    /// which can stall if the child stops reading (Ctrl+S, stopped process).
    /// Dropping the Session drops this sender, which ends the writer thread.
    pub write_tx: std::sync::mpsc::Sender<Vec<u8>>,
    /// Not read directly — held so the input side of the master pipe stays
    /// open for the Session's lifetime and drops in field order (before
    /// `master`), per the drop-order contract above. The writer/reader
    /// threads hold their own clones of this Arc.
    _writer: Arc<Mutex<Box<dyn Write + Send>>>,
    pub master: Mutex<Box<dyn MasterPty + Send>>,
    /// Shell process id, for the /proc-based cwd fallback (`pty_cwd`) when
    /// shell integration never reports OSC 7. None if the PTY backend
    /// couldn't report one.
    pub child_pid: Option<u32>,
}

impl Drop for Session {
    fn drop(&mut self) {
        // If the session Arc is dropped without an explicit pty_close (e.g.
        // frontend disconnected, window crashed, dev HMR), the reader/flusher
        // threads would otherwise stay alive forever holding the child. Kill
        // the child here so the reader hits EOF and the threads unwind.
        if let Ok(mut k) = self.killer.lock() {
            let _ = k.kill();
        }
    }
}
// Serializes ConPTY create and close: overlapping pseudoconsole lifecycle
// calls corrupt the new console so its shell never pumps output (issue #356).
#[cfg(windows)]
static CONPTY_LIFECYCLE_LOCK: Mutex<()> = Mutex::new(());

pub(super) fn drop_session(session: Arc<Session>) {
    // Poison recovery: the lock only serializes timing (it guards no data),
    // so if a previous holder panicked we can safely keep using it. A plain
    // .unwrap() here would make every terminal open/close panic forever
    // after one bad spawn (pitfall #8's cascade, applied to pitfall #1A).
    #[cfg(windows)]
    let _guard = CONPTY_LIFECYCLE_LOCK
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    drop(session);
}

struct ChildKillGuard {
    killer: Option<Box<dyn ChildKiller + Send + Sync>>,
}

impl ChildKillGuard {
    fn new(killer: Box<dyn ChildKiller + Send + Sync>) -> Self {
        Self {
            killer: Some(killer),
        }
    }

    fn disarm(&mut self) {
        self.killer = None;
    }
}

impl Drop for ChildKillGuard {
    fn drop(&mut self) {
        if let Some(mut k) = self.killer.take() {
            let _ = k.kill();
        }
    }
}

/// Guards the reader/flusher/waiter spawn section of `spawn()`. If any of those
/// three `thread::Builder::spawn` calls fails (OS thread exhaustion or OOM), the
/// child shell is already running and some sibling threads may already be live.
/// On drop — unless disarmed once all three are up — this kills the child (so
/// the reader hits EOF and unwinds) and sets `done` + notifies the condvar so
/// the flusher's idle wait returns and it exits instead of looping forever.
/// Replaces the old `.expect("spawn pty … thread")` calls, which panicked on a
/// Tauri worker thread and could take down the whole process (pitfall #9).
struct ThreadSpawnGuard {
    killer: Option<Box<dyn ChildKiller + Send + Sync>>,
    done: Arc<AtomicBool>,
    pending: Arc<(Mutex<Vec<u8>>, Condvar)>,
}

impl ThreadSpawnGuard {
    fn disarm(&mut self) {
        self.killer = None;
    }
}

impl Drop for ThreadSpawnGuard {
    fn drop(&mut self) {
        if let Some(mut k) = self.killer.take() {
            let _ = k.kill();
            self.done.store(true, Ordering::Release);
            self.pending.1.notify_all();
        }
    }
}

#[allow(clippy::too_many_arguments)]
pub fn spawn(
    cols: u16,
    rows: u16,
    cwd: Option<String>,
    workspace: WorkspaceEnv,
    extra_env: HashMap<String, String>,
    shell_override: Option<String>,
    on_data: Channel<Response>,
    on_exit: Channel<i32>,
) -> Result<(Arc<Session>, PtySize), String> {
    // Poison recovery — see drop_session; the lock guards timing, not data.
    #[cfg(windows)]
    let _spawn_guard = CONPTY_LIFECYCLE_LOCK
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let pty_system = native_pty_system();
    let size = PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    };
    let pair = pty_system.openpty(size).map_err(|e| e.to_string())?;

    let cmd = shell_init::build_command(cwd, workspace, extra_env, shell_override)?;
    let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);

    // Kill the child if any of the pipe setup below fails so the spawned shell
    // can't outlive an aborted pty_open.
    let mut guard = ChildKillGuard::new(child.clone_killer());
    let killer = child.clone_killer();
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer: Arc<Mutex<Box<dyn Write + Send>>> = Arc::new(Mutex::new(
        pair.master.take_writer().map_err(|e| e.to_string())?,
    ));
    guard.disarm();

    #[cfg(windows)]
    let job = match child.process_id() {
        Some(pid) => match super::job::PtyJob::create_for(pid) {
            Ok(j) => Some(j),
            Err(e) => {
                log::warn!("pty job-object setup failed for pid={pid}: {e}");
                None
            }
        },
        None => None,
    };

    let (write_tx, write_rx) = std::sync::mpsc::channel::<Vec<u8>>();

    let child_pid = child.process_id();
    let session = Arc::new(Session {
        #[cfg(windows)]
        _job: job,
        killer: Mutex::new(killer),
        write_tx,
        _writer: writer.clone(),
        master: Mutex::new(pair.master),
        child_pid,
    });

    let pending: Arc<(Mutex<Vec<u8>>, Condvar)> =
        Arc::new((Mutex::new(Vec::with_capacity(READ_BUF)), Condvar::new()));
    let done = Arc::new(AtomicBool::new(false));
    let spawn_at = Instant::now();

    // Tears down the child + already-spawned threads if any of the three
    // spawns below fails; disarmed once all three are running. See the struct.
    let mut spawn_guard = ThreadSpawnGuard {
        killer: Some(child.clone_killer()),
        done: done.clone(),
        pending: pending.clone(),
    };

    // Input writer thread: drains the pty_write FIFO queue and does the
    // blocking pipe writes, so a full kernel pipe (child stopped reading)
    // stalls only this thread — never the IPC handler. Exits when the last
    // sender (held by the Session) drops, or on a write error (child gone).
    let writer_for_input = writer.clone();
    thread::Builder::new()
        .name("nexis-pty-writer".into())
        .spawn(move || {
            for chunk in write_rx {
                let mut w = writer_for_input.lock().unwrap_or_else(|e| e.into_inner());
                if let Err(e) = w.write_all(&chunk) {
                    // EPIPE is expected once the child exits.
                    log::debug!("pty writer thread exiting: {e}");
                    break;
                }
            }
        })
        .map_err(|e| format!("spawn pty writer thread: {e}"))?;

    // Watchdog sentinels: flipped when the reader/flusher thread exits for
    // any reason, panic included (pitfall #8 defense-in-depth — see watchdog.rs).
    let reader_finished = Arc::new(AtomicBool::new(false));
    let flusher_finished = Arc::new(AtomicBool::new(false));

    let pending_r = pending.clone();
    let writer_for_da = writer.clone();
    let reader_sentinel = reader_finished.clone();
    let reader_thread = thread::Builder::new()
        .name("nexis-pty-reader".into())
        .spawn(move || {
            let _alive = watchdog::SetOnDrop(reader_sentinel);
            let mut buf = [0u8; READ_BUF];
            let mut filtered: Vec<u8> = Vec::with_capacity(READ_BUF);
            let mut da_filter = DaFilter::new();
            let mut dropped_bytes: u64 = 0;
            let mut logged_first = false;
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        if !logged_first {
                            logged_first = true;
                            log::debug!(
                                "pty first byte after {}ms",
                                spawn_at.elapsed().as_millis()
                            );
                        }
                        filtered.clear();
                        da_filter.process(&buf[..n], &mut filtered, |reply| {
                            if let Ok(mut w) = writer_for_da.lock() {
                                let _ = w.write_all(reply);
                            }
                        });
                        if filtered.is_empty() {
                            continue;
                        }
                        let (lock, cv) = &*pending_r;
                        let mut g = lock.lock().unwrap_or_else(|e| e.into_inner());
                        if g.len() + filtered.len() > MAX_PENDING {
                            dropped_bytes += g.len() as u64;
                            g.clear();
                            g.extend_from_slice(OVERFLOW_NOTICE);
                        }
                        g.extend_from_slice(&filtered);
                        cv.notify_one();
                    }
                    Err(e) => {
                        log::debug!("pty reader ended: {e}");
                        break;
                    }
                }
            }
            pending_r.1.notify_one();
            if dropped_bytes > 0 {
                log::warn!("pty backpressure: dropped {dropped_bytes} bytes (cap {MAX_PENDING})");
            }
        })
        .map_err(|e| format!("spawn pty reader thread: {e}"))?;

    let on_data_flush = on_data.clone();
    let pending_f = pending.clone();
    let done_f = done.clone();
    let flusher_sentinel = flusher_finished.clone();
    thread::Builder::new()
        .name("nexis-pty-flusher".into())
        .spawn(move || {
            let _alive = watchdog::SetOnDrop(flusher_sentinel);
            let (lock, cv) = &*pending_f;
            loop {
                {
                    let mut g = lock.lock().unwrap_or_else(|e| e.into_inner());
                    while g.is_empty() {
                        if done_f.load(Ordering::Acquire) {
                            return;
                        }
                        let (next, _) = cv
                            .wait_timeout(g, FLUSH_MAX_IDLE)
                            .unwrap_or_else(|e| e.into_inner());
                        g = next;
                    }
                }
                // Coalesce a short window so a burst flushes as one chunk.
                thread::sleep(FLUSH_COALESCE);
                let chunk = std::mem::take(&mut *lock.lock().unwrap_or_else(|e| e.into_inner()));
                if chunk.is_empty() {
                    continue;
                }
                if let Err(e) = on_data_flush.send(Response::new(chunk)) {
                    log::debug!("pty flusher exiting, channel closed: {e}");
                    break;
                }
            }
        })
        .map_err(|e| format!("spawn pty flusher thread: {e}"))?;

    // The watchdog needs its own channel handle — it must be able to surface
    // a notice precisely when the flusher (the normal sender) is dead.
    watchdog::watch(
        reader_finished,
        flusher_finished,
        done.clone(),
        on_data.clone(),
    );

    let on_data_exit = on_data;
    let pending_e = pending;
    let done_e = done;
    thread::Builder::new()
        .name("nexis-pty-waiter".into())
        .spawn(move || {
            let code = match child.wait() {
                Ok(status) => status.exit_code() as i32,
                Err(e) => {
                    log::warn!("pty child wait failed: {e}");
                    -1
                }
            };
            // Wait for the reader to hit EOF before taking a final snapshot of
            // `pending`, so the last line of output never races the Exit event.
            #[cfg(windows)]
            {
                let deadline = Instant::now() + Duration::from_millis(50);
                while Instant::now() < deadline && !reader_thread.is_finished() {
                    thread::sleep(Duration::from_millis(5));
                }
            }
            #[cfg(not(windows))]
            if let Err(e) = reader_thread.join() {
                log::error!("pty reader thread panicked: {e:?}");
            }
            let (lock, cv) = &*pending_e;
            let tail = std::mem::take(&mut *lock.lock().unwrap_or_else(|e| e.into_inner()));
            if !tail.is_empty() {
                if let Err(e) = on_data_exit.send(Response::new(tail)) {
                    log::debug!("pty final-data send failed (channel closed): {e}");
                }
            }
            done_e.store(true, Ordering::Release);
            cv.notify_all();
            if let Err(e) = on_exit.send(code) {
                log::debug!("pty exit send failed (channel closed): {e}");
            }
        })
        .map_err(|e| format!("spawn pty waiter thread: {e}"))?;

    // All three I/O threads are live — disarm so the child is not killed.
    spawn_guard.disarm();
    Ok((session, size))
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    // Pitfall 8 regression: PTY threads use `unwrap_or_else(|e| e.into_inner())`
    // on the shared `pending` mutex so a thread panic doesn't cascade to sibling
    // threads via mutex poisoning. Demonstrate that the pattern works correctly.

    #[test]
    fn poisoned_mutex_is_recovered_not_panicked() {
        let m: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(vec![1, 2, 3]));
        let m2 = Arc::clone(&m);

        // Poison the mutex by panicking while holding the lock.
        let _ = std::panic::catch_unwind(move || {
            let _g = m2.lock().unwrap();
            panic!("intentional poison for test");
        });

        assert!(m.is_poisoned(), "mutex must be poisoned after the panic");

        // The fix: recover data from the poisoned guard instead of panicking.
        let data = m.lock().unwrap_or_else(|e| e.into_inner());
        assert_eq!(*data, vec![1, 2, 3], "data must survive mutex poisoning");
    }

    #[test]
    fn unwrap_on_poisoned_mutex_would_panic() {
        let m: Arc<Mutex<u32>> = Arc::new(Mutex::new(0));
        let m2 = Arc::clone(&m);

        let _ = std::panic::catch_unwind(move || {
            let _g = m2.lock().unwrap();
            panic!("poison");
        });

        // Verify that the BAD pattern (.unwrap()) does indeed panic on a poisoned
        // lock — confirming that the fix (.unwrap_or_else) is necessary.
        let result = std::panic::catch_unwind(|| {
            let _g = m.lock().unwrap();
        });
        assert!(
            result.is_err(),
            "lock().unwrap() must panic on a poisoned mutex"
        );
    }

    #[test]
    fn condvar_wait_timeout_unwrap_or_else_recovers_from_poison() {
        use std::sync::Condvar;
        use std::time::Duration;

        let pair: Arc<(Mutex<bool>, Condvar)> = Arc::new((Mutex::new(false), Condvar::new()));
        let pair2 = Arc::clone(&pair);

        // Poison the mutex via the condvar's internal lock.
        let _ = std::panic::catch_unwind(move || {
            let (lock, _cv) = &*pair2;
            let _g = lock.lock().unwrap();
            panic!("poison via condvar");
        });

        let (lock, cv) = &*pair;
        assert!(lock.is_poisoned());

        // Recovery via wait_timeout — mirrors the flusher thread's code path.
        let g = lock.lock().unwrap_or_else(|e| e.into_inner());
        let (_guard, _timeout_result) = cv
            .wait_timeout(g, Duration::from_millis(1))
            .unwrap_or_else(|e| e.into_inner());
        // Reaching here without panicking confirms the fix works.
    }
}
