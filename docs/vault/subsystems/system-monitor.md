---
type: subsystem
description: btop-style resource analyzer — Rust sysinfo sampling, braille charts, process table with kill.
---

# System Monitor

The Dev Tools sidebar panel showing live machine resources: per-core CPU, memory/swap, per-disk capacity and I/O, per-interface network throughput, and a sortable process table with kill actions. Sampling is Rust-side behind a polling command; rendering is a React panel that draws charts as **braille text**, not canvas.

Distinct from [[activity-panel]] territory: `src/modules/processes/` tracks *Nexis's own* agent-spawned background processes. This panel answers "what is my machine doing". Same word "processes", different data source — they were deliberately kept separate.

## Key files

- `src-tauri/src/modules/sysmon.rs` — the whole backend: `Sampler`, `sysmon_sample`, `sysmon_kill`
- `src/modules/sysmon/braille.ts` — `brailleChart` / `brailleSparkline`, pure + unit-tested
- `src/modules/sysmon/useSystemMonitor.ts` — polling loop and rolling history
- `src/modules/sysmon/interval.ts` — the allowed poll steps and the coercion the settings store uses (leaf module, no imports, so the store can own the pref without importing the panel)
- `src/modules/sysmon/SystemMonitorPanel.tsx` — the panel
- `src/lib/format.ts` — `formatBytes` / `formatBytesPerSec` / `formatDuration` (shared, not panel-private)

## Invariants / gotchas

- **The sampler is process-global and stateful on purpose.** CPU %, disk I/O, and network throughput are deltas between two `refresh` calls, so `System`/`Disks`/`Networks` must persist across calls. Rebuilding them per sample yields permanent zeros.
- **`elapsed_ms == 0` marks the first sample.** Its rates are meaningless; the frontend charts only its absolute readings. Don't "fix" the zeros.
- **Per-second normalization belongs in Rust.** Only the sampler knows the true interval, which drifts from the nominal poll period under load. See the module doc comment for why dividing by an assumed interval is wrong.
- **Sort happens in Rust, before the 250-row truncation.** Sorting frontend-side after truncation would silently sort an arbitrary prefix.
- **The poll period is the `sysmonIntervalMs` preference, not a constant.** Steps are 100 / 200 / 500 / 1000 ms, default 1000 (the historical hard-coded value), switched from the panel header and persisted through `writePref()`. Two consequences worth holding onto: the history is a *fixed 128 samples*, so a faster rate shortens the visible window (100 ms ≈ 13 s, 1 s ≈ 2 min) rather than adding detail to the same window; and each sample re-walks the process table, so the fast steps cost real CPU on the machine being measured. Stored values are snapped by `coerceSysmonInterval` — never trust the file.
- **`sysmon_sample` must stay `async` + `heavy()`.** A full process refresh walks `/proc`; sync would stall the Tauri main thread and every queued `pty_write`. Enforced by the `heavy_commands_stay_async` tripwire.
- **`sysinfo` is pinned feature-minimal** (`system`, `disk`, `network`). Defaults pull `component`, `user`, and rayon. The dep costs ~168 KiB of the <10 MB release budget — re-measure before adding a feature.
- Process CPU is **percent of one core** (`top` convention), so it exceeds 100 on threaded processes. The panel divides by core count for its column.
- `sysmon_kill` re-refreshes the single pid before signalling — a stale table must never signal a recycled pid.

## Debugging entry points

- Charts flat/empty but numbers fine → first sample only, or a rate series being fed absolute values
- Charts full-height and noisy on an idle box → rolling-max axis floor (`rollingMax` in the panel) too low
- Chart columns misaligned → braille needs monospace; check the `<pre>` didn't lose its font
- Panel blank, no error → it's lazy-loaded; check the `Suspense` branch in `App.tsx` and pack gating
- Whole panel missing from the rail → Dev Tools pack disabled, see [[expansion-packs]] / `src/lib/packs.ts`

## Related

[[rust-modules]] · [[frontend-modules]] · [[ipc-surface]] · [[expansion-packs]]
