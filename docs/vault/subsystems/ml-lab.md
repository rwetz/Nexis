---
type: subsystem
description: ML Lab — the external nexis-ml engine, its detection/spawn bridge, the training store, and the panel's charts and network diagram.
---

# ML Lab

Trains models locally through an **external** tool called `nexis-ml`, which Nexis does not ship: it is detected (venv / PATH / a managed download) and driven over a line-oriented NDJSON protocol. Rust owns the process and batches its output into Tauri events; the frontend owns the store, the charts, and the run browser.

Two engines answer to the same name and have different feature sets — the Python one (torch, every template, HTML report) and the standalone Rust one (config-only, wgpu, ONNX export). `engineKindFromEnv` tells them apart by the `backend` field only the Rust engine reports; treat `null` as "don't block" and let the engine raise its own error. The product spec lives in `docs/ML_SUITE.md` and `docs/ML_LAB_GUIDE.md` — this note is only the code map.

## Key files

- `src-tauri/src/modules/ml.rs` — every `ml_*` command: detect, env probe, spawn + reader/flusher threads, pip install, the pinned managed-engine download
- `src-tauri/src/modules/python.rs:py_detect_envs` — interpreter discovery, shared with the status-bar Python picker
- `src/modules/ml/lib/engine-bridge.ts` — the IPC seam; candidate building, the detection memo, event subscription
- `src/modules/ml/store.ts` — engine state, the live run, historical runs, compare, serve/playground
- `src/modules/ml/MlPanel.tsx` — the whole panel (large; setup card, run browser, hyperparams, playground)
- `src/modules/ml/NetworkGraph.tsx` — the architecture drawing, canvas; also the `ml-network` tab body via `MlNetworkStack.tsx`
- `src/modules/ml/lib/protocol.ts` / `series.ts` / `artifacts.ts` — event parsing, metric buffers, on-disk artifacts

## Invariants / gotchas

- **Every engine command is workspace-scoped.** `ml_detect` / `ml_env` / `ml_spawn` / `ml_install` / `py_detect_envs` take `workspace` and build their child through `ml.rs:env_command`, which routes a WSL workspace through `wsl.exe`. `ml_spawn` authorizes the *host* view of the project dir but hands the child the *Linux* path. See CLAUDE.md pitfall #20 before adding a command here.
- **Anything host-scoped is hidden, not silently offered, in a WSL workspace** — the pinned download, the managed binary, its uninstall row. A Windows `.exe` in the host's app-data dir is unreachable from inside a distro.
- **Caches of engine facts must carry the workspace scope.** `detectCache` keys on `currentWorkspaceScopeKey()`; `MlStore.engineScope` records who answered and discards everything on a mismatch.
- **Metric buffers are NOT in the store** (pitfall #14) — they live in a module-level Map in `lib/series.ts`; components subscribe to the primitive `seriesTick` and read through `getSeriesMap()`.
- **`workspace_authorize` runs before every `ml_spawn`** (pitfall #1C), same as `pty-bridge` does for `pty_open`.
- **The detection promise is memoized and its `.catch()` deletes the entry** (pitfall #10) — a rejected promise left in a Map is indistinguishable from a resolved one.
- **`ALLOWED_SUBCOMMANDS` and `is_nexis_ml_exe` are the security boundary.** `ml_spawn` must never become a generic process launcher; the exe stem must be exactly `nexis-ml` and the subcommand must be on the allowlist.
- **Canvas drawings size through `src/lib/canvas.ts:canvasBackingScale`** (`dpr × --app-zoom`) and take `zoomLevel` as a redraw dependency — a `ResizeObserver` never fires for a zoom change. Same family as pitfall #15.

## Debugging entry points

- Engine "ready" but training fails on the project dir → workspace-scope mismatch; check `engineScope` and which env `env_command` built for
- Panel shows a Windows engine in a WSL workspace → a new command missing its `workspace` parameter (pitfall #20)
- A button in the panel appears inert → check for a store guard that returns early while the button stays enabled, and remember `engineError` is only rendered in the panel body since 1.25
- Charts frozen but the run is live → `seriesTick` not bumping, or the component subscribed to the buffer instead of the tick
- Network diagram blank → `parseTomlNet` returned null; the project's `train.toml` has no recognizable `[net]`

## Related

[[rust-modules]] · [[frontend-modules]] · [[ipc-surface]] · [[zustand-stores]] · [[icon-and-motion-system]]
