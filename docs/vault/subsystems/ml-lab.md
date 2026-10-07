---
type: subsystem
description: ML Lab — the external nexis-ml engine, its detection/spawn bridge, the training store, and the panel's charts and network diagram.
---

# ML Lab

Trains models locally through an **external** tool called `nexis-ml`, which Nexis does not ship: it is detected (venv / PATH / a managed download) and driven over a line-oriented NDJSON protocol. Rust owns the process and batches its output into Tauri events; the frontend owns the store, the charts, and the run browser.

The **AI / ML** preset turns on standard navigation and code tools, AI Extras, Dev Tools, and the ML Lab pack. Under any configuration with the ML Lab pack, its former `ml` rail view is promoted into the titlebar as a singleton `ml-lab` workbench tab; the store remains the single owner of engine, project, and live-run state, so the move creates no second training session.

**The standalone (Rust) engine is the default.** It is a single pinned binary from GitHub releases with no Python involved, and it is the only thing the setup card installs. The Python engine is documented, not automated — `PythonEngineSteps` hands over the commands, because choosing an interpreter and committing to a ~3 GB PyTorch download are not decisions Nexis should make silently. `upgradeToGpu` is the one pip path still driven in-app, and it acts on an environment the user already built.

Two engines answer to the same name and have different feature sets — the Python one (torch, every template, HTML report) and the standalone Rust one (config-only, wgpu, ONNX export). `engineKindFromEnv` tells them apart by the `backend` field only the Rust engine reports; treat `null` as "don't block" and let the engine raise its own error. The product spec lives in `docs/ML_SUITE.md` and `docs/ML_LAB_GUIDE.md` — this note is only the code map.

## Key files

- `src-tauri/src/modules/ml.rs` — every `ml_*` command: detect, env probe, spawn + reader/flusher threads, pip install, the pinned managed-engine download
- `src/capabilities/python/api.ts` / `src-tauri/src/modules/python.rs:py_detect_envs` — typed workspace-scoped interpreter discovery, shared with the status-bar Python picker
- `src/capabilities/ml/api.ts` — typed workspace/host command descriptors and event-scope ownership
- `src/capabilities/ml/index.tsx` — the saved `ml` sidebar contribution; it receives only the current workspace root and network-tab action from the composition host
- `src/modules/ml/lib/engine-bridge.ts` — domain bridge; candidate building, detection memo, captured authorization/spawn, event subscription
- `src/modules/ml/store.ts` — engine state, the live run, historical runs, compare, serve/playground
- `src/modules/ml/MlPanel.tsx` — the shared panel body (large; setup card, run browser, hyperparams, playground), lazy-loaded by the capability and reused by the full-workspace tab
- `src/capabilities/workbenches/windows.tsx` (`MlLabWindow`) — the ML Lab window (a main-window `ml-lab` tab until 2026-09-30); renders the shared panel and opens the network diagram over it in the same window
- `src/modules/ml/NetworkGraph.tsx` — the architecture drawing, canvas; also the `ml-network` tab body via `MlNetworkStack.tsx`
- `src/modules/ml/lib/protocol.ts` / `series.ts` / `artifacts.ts` — event parsing, metric buffers, on-disk artifacts
- `src/modules/ml/lib/stock-models.ts` / `starter-data.ts` / `model-blueprint.ts` — the stock-network catalog, the seeded starter-dataset generators, and the creation plan (`planCreation` / `applyOverrides`)
- `src/modules/ml/lib/projects.ts` — project discovery and run-store reads with no store state, shared by the store and the chat tools
- `src/modules/ml/lib/headless.ts` / `model-tools.ts` — headless `serve` sessions and the `ml_list_models` / `ml_predict` / `ml_rank_csv` agent tools, registered by `src/plugins/ml/index.ts`

## Invariants / gotchas

- **Every engine command is workspace-scoped.** `ml_detect` / `ml_env` / `ml_spawn` / `ml_install` / `py_detect_envs` take `workspace` and build their child through `ml.rs:env_command`, which routes a WSL workspace through `wsl.exe`. `ml_spawn` authorizes the *host* view of the project dir but hands the child the *Linux* path. See AGENTS.md pitfall #20 before adding a command here.
- ML project discovery, `train.toml`, `PROJECT.md`, run metadata, and metrics reads go through `platform/filesystem.ts`. Do not reconstruct `WorkspaceEnv` payloads in the store or UI.
- **Anything host-scoped is hidden, not silently offered, in a WSL workspace** — the pinned download, the managed binary, its uninstall row. A Windows `.exe` in the host's app-data dir is unreachable from inside a distro. Hiding alone left WSL with no path at all, so `WslEngineSteps` gives the commands instead.
- **`lib/pythonSupport.ts` only ever warns.** Its torch version bounds are a heuristic that goes stale in one direction (a new CPython gains wheels later), so a stale bound must never block an environment that already works.
- **Caches of engine facts must carry the workspace scope.** `detectCache` keys on `currentWorkspaceScopeKey()`; `MlStore.engineScope` records who answered and discards everything on a mismatch.
- **Metric buffers are NOT in the store** (pitfall #14) — they live in a module-level Map in `lib/series.ts`; components subscribe to the primitive `seriesTick` and read through `getSeriesMap()`.
- **`workspace_authorize` runs before every `ml_spawn`** (pitfall #1C), same as `pty-bridge` does for `pty_open`.
- **Authorization and spawn reuse one captured workspace environment.** Switching from WSL to local, or between distros, while authorization is pending must not stamp the later environment onto `ml_spawn`.
- **The detection promise is memoized and its `.catch()` deletes the entry** (pitfall #10) — a rejected promise left in a Map is indistinguishable from a resolved one.
- **The candidate list is speculative, so an absent candidate is not an error.** `ml.rs:Probe` is three-valued: `Missing` is silent, `Failed` is a diagnosis. Reporting the last candidate's ENOENT instead made every "no engine" state show the managed engine's path and `os error 3`. Absolute host paths are ruled out with `exists()` rather than a spawn — the panel re-detects on every open.
- **`installSid` is recorded only after `spawnInstall` resolves.** An exit inside that window matches nothing, and nothing else clears `installing` — which disables the setup card's buttons. `_applyExit`/`_applyStderr` treat an unmatched event during an in-flight install as that install's.
- **`ALLOWED_SUBCOMMANDS` and `is_nexis_ml_exe` are the security boundary.** `ml_spawn` must never become a generic process launcher; the exe stem must be exactly `nexis-ml` and the subcommand must be on the allowlist.
- **Canvas drawings size through `src/lib/canvas.ts:canvasBackingScale`** (`dpr × --app-zoom`) and take `zoomLevel` as a redraw dependency — a `ResizeObserver` never fires for a zoom change. Same family as pitfall #15.
- **Stock networks are values on an engine template, not new templates.** Each entry in `STOCK_MODELS` names a family (`tabular` / `image` / `textgen`) and the documented `[model]` / `[train]` keys to set; starters add a generated dataset. The brief goes to `PROJECT.md` after scaffold success, never into `train.toml`: the engine owns that schema.
- **Creation writes only keys the scaffold already owns, plus `[data] path`/`target`.** `applyOverrides` uses `tomlSet` (a no-op on an absent key) and reports what it skipped to the log; only overrides flagged `upsert` (the two documented `[data]` keys, which the standalone tabular scaffold omits) may add a key. A Rust engine may reject unknown keys, so never widen `upsert` to model knobs. With a stock network the scale contributes only the training budget (`budgetOnly`); the network's own shape wins.
- **Starter datasets are synthetic, seeded, and say so.** Integer class ids (the standalone engine documents a numeric target), meanings in `PROJECT.md`. `writeStarterFiles` never overwrites an existing path. Do not add real-world figures to a generator: the Lab must not pass invented numbers off as facts.
- **Headless serve sessions are invisible to the store.** `headless.ts` registers a session's sid before routing its events, and `_applyProto` / `_applyStderr` / `_applyExit` drop registered sids. Without that, a chat tool's `ready` batch could be adopted by a pending Playground, and its exit during an install's unstamped window was taken for the install's (which clears `installing`). Its listeners attach before the spawn (`subscribeMlProtocolAttached`), unclaimed batches are buffered until the sid is known, the sid stays registered 10 s after kill so the in-flight exit is still dropped, and sessions are serialized. The one race left: the panel and a tool both spawning within the same few milliseconds; `panelQuiet` waits out the panel's own unstamped window first.
- **The chat tools are read-only, so they are auto-approved; keep them that way.** A project is chosen by name from `discoverProjects`, a run by id from `readRuns`, a CSV only inside the workspace root after `..` is collapsed. A tool that trains, writes or deletes must use the default `approval: "ask"`.

## Debugging entry points

- Engine "ready" but training fails on the project dir → workspace-scope mismatch; check `engineScope` and which env `env_command` built for
- Panel shows a Windows engine in a WSL workspace → a new command missing its `workspace` parameter (pitfall #20)
- A button in the panel appears inert → check for a store guard that returns early while the button stays enabled; also check whether `installing` is stuck true, which disables the setup card wholesale
- "Engine not found" naming a specific path → almost always just an absent candidate; open the setup card's "Where Nexis looked" list before believing the path is the problem
- Charts frozen but the run is live → `seriesTick` not bumping, or the component subscribed to the buffer instead of the tick
- Network diagram blank → `parseTomlNet` returned null; the project's `train.toml` has no recognizable `[net]`

## Related

[[rust-modules]] · [[frontend-modules]] · [[ipc-surface]] · [[zustand-stores]] · [[icon-and-motion-system]]
