---
type: subsystem
description: PTY subsystem — terminal sessions end to end, from pty-bridge.ts to ConPTY. The model example of a subsystem note.
---

# PTY subsystem

Terminal sessions end to end: frontend xterm.js ↔ Tauri IPC ↔ Rust PTY threads ↔ shell process.

## Key files

- `src/modules/terminal/lib/pty-bridge.ts` — frontend seam; `openPty` **must call `workspace_authorize` before `pty_open`** for any user-supplied cwd
- `src/modules/terminal/lib/rendererPool.ts` — xterm slot pool; parked slots lose WebGL after `SLOT_REAP_GRACE_MS` and are disposed beyond `WARM_PARKED_SLOTS` (as of 2026-07). Deliberate GL teardown must go through `disposeSlotWebgl` so it doesn't count toward the involuntary-loss thrash heuristic
- `src/modules/terminal/lib/osc-handlers.ts` — OSC 7 (cwd, gated by 133 in-command state), 133 (prompt marks), 0/2 (title), 52 (clipboard — **write-only**; reads are always consumed silently, writes gated by the `terminalOsc52Clipboard` pref). `ShellIntegrationState.markersSeen` flips true on any 133 or *accepted* OSC 7 — a rejected in-command OSC 7 deliberately doesn't count (untrusted output must not disable the fallback below). Also owns the failed-command "✦ Explain" chip (`terminalExplainFailures` pref): at `D;<nonzero>` it captures command/output between the B/C markers and the cursor (tail-capped; degrades when PowerShell omits C), and the click dispatches `nexis:ai-explain-failure` — bridged into the AI composer by App.tsx, same decoupling as selections. Skips exit 130 and stale-`$?` bare-Enter re-emits (needs C or output as evidence a command ran)
- `src-tauri/src/modules/pty/session.rs` — session lifecycle, reader/flusher/waiter/writer threads, `CONPTY_LIFECYCLE_LOCK`, `MAX_PENDING` (4 MiB backpressure cap)
- `src-tauri/src/modules/pty/watchdog.rs` — global stall detector (2026-07): drop-guard sentinels on the reader/flusher flag thread death (panic included); one `nexis-pty-watchdog` thread reports a red in-terminal notice when a thread is dead >5 s without the waiter's `done` handoff. Notice goes over the session's own `on_data` channel (works with both PTY threads dead); deliberately no fake exit event — that path auto-respawns and would kill a live child
- `src-tauri/src/modules/pty/shell_init.rs` — shell profile injection; profiles cached at `~/.cache/nexis/shell-integration/` via `write_if_changed`
- Thread names are prefixed `nexis-pty-*` — searchable in logs

## Invariants (authoritative detail in CLAUDE.md pitfalls #1, #6–#9)

- ConPTY create and close are serialized by one shared lock; `pty_close` drops sessions on a detached thread
- PowerShell launches via `-Command` + `NEXIS_PWSH_PROFILE` env var, never `-File`
- Shared PTY mutexes recover from poison with `unwrap_or_else(|e| e.into_inner())` — no bare `.unwrap()`
- No `.unwrap()`/`.expect()` on the drop-thread spawn path
- Input goes through a per-session `nexis-pty-writer` thread fed by a FIFO channel (`Session.write_tx`); `pty_write` only enqueues. Keep it that way: a direct `write_all` in the command blocks the main thread when the child stops reading (Ctrl+S), and a `spawn_blocking` per write can reorder rapid keystrokes — the channel is what guarantees byte order. Device-query replies (DA/DSR/CPR) that xterm generates frontend-side ride the same `onData` → `pty_write` path, so they can't interleave with keystrokes — as long as `pty_write` stays sync and pty-bridge stays the only invoke site, both tripwired (`pty_write_stays_sync_and_enqueue_only` in pitfall_invariants.rs; `pty_write` confinement in pitfall-guards.test.ts).

## cwd tracking when integration is missing (2026-07)

If no integration marker arrives ~5 s after PTY open (`markersSeen` still false), `useTerminalSession.ts` logs once and starts a 3 s `pty_cwd` poll — a `/proc/<pid>/cwd` readlink via `Session.child_pid`, Linux-only (other platforms return `None` and the frontend keeps its last-known cwd). The poll self-cancels the moment a real marker arrives, and both timers are cleared on dispose/respawn (`clearCwdFallback`). Without integration the exit gutter, the failed-command "✦ Explain" chip, and in-command OSC 7 spoof-gating are still unavailable — this fallback only rescues cwd tracking (tab labels, new-tab cwd, git panel).

## Scrollback restore on relaunch (2026-07, persistent sessions Milestone A)

Exit path: `useTabs`'s `onCloseRequested` handler mints per-tab snapshot ids, force-saves tab state, serializes each non-private terminal's active pane (`serializeSessionForExit` — live slots via `serializeLeafSnapshot`, parked ones from `Session.snapshot` + dormant ring), and writes through `snapshot-bridge.ts` → `modules/snapshots.rs` (atomic tmp+rename under `~/.cache/nexis/session-snapshots/`), then destroys the window; a 1.5 s race caps how long exit can block. Restore path: `buildTabsFromSaved` registers leafId → snapshotId in `sessionRestore.ts`; `ensureSession` chains the load into `Session.ready` **before** attach binds the slot and opens the PTY — that ordering is what guarantees the replay lands before the first shell byte. The divider string lives in `useTerminalSession.ts` (`RESTORE_DIVIDER`). Exit-time gc (and the restore-tabs-off path in App.tsx) keeps the snapshot dir from accumulating orphans.

## Debugging entry points

- Blank terminal → follow the 5-step checklist in CLAUDE.md pitfall #1
- Missing output on long commands → backpressure cap, pitfall #7 (intentional)
- Stale shell profile in dev → delete the cached file; don't bypass `write_if_changed` (pitfall #6)

## Related

[[rust-modules]] · [[frontend-modules]]
