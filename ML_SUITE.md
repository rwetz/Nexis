# Nexis ML Suite — working spec (draft)

> 📖 **Using the Lab?** See the [Nexis AI Lab — Complete Guide](ML_LAB_GUIDE.md)
> — how and why to use every feature. This file is the design/decision record.

> Status: engine repo live ([rwetz/nexis-ml](https://github.com/rwetz/nexis-ml), local: `E:\nexis-ml`, v0.3.0) — protocol v1, run store, harness, `tabular` + `textgen` templates, `new`/`train`/`runs`/`replay`/`env`, stdin cancel all verified end-to-end. Nexis-side wireup + UX pass done (2026-06-12): "ML Lab" pinned to the sidebar rail by default, plain-language panel (progress bar, status sentences, friendly metric names, hero chart), one-click engine install (`ml_install` → pip into the detected venv, `default` or `cuda-torch` flavor), in-panel project creation (`Create & train`), project selector. GPU support (2026-06-12): `device = auto|cpu|gpu` in train.toml with a job-size auto heuristic, `device` field on run.started/summary, `nexis-ml env` capability probe + `nvidia-smi` host probe, GPU chip / "Enable GPU" upsell / install-with-GPU checkbox in the panel. Phase 2 started (2026-06-13): `textgen` template (engine v0.3.0) — a hand-rolled char-level tiny GPT streaming `loss/val`/`perplexity/val` + a `sample` event per epoch; Nexis side renders generated-text snapshots (scrub through passes) and the create card now picks between the `tabular`/`textgen` templates. Verified end-to-end on the RTX 4070 SUPER (gibberish → words by epoch 4 of a smoke run). Item #2 done (2026-06-13): the per-epoch confusion-matrix artifact renders as a colored grid in the panel (accuracy + pass label) instead of a log line — `lib/artifacts.ts` + `protocol.ts` `latestConfusionMatrix`, live and on historical-run load. Item #3 done (2026-06-13): inference — engine `infer`/`serve` (v0.4.0) rebuild the model from checkpoint sizes; Rust `serve` allowlist + `ml_stdin`; a Playground panel (textgen prompt→text, tabular feature form→class probs) over a `serve` session. Engine verified end-to-end (textgen + tabular, infer + serve) on the RTX 4070 SUPER. Item #4 done (2026-06-13): run comparison — check 2+ past runs to overlay their metric curves (colored multi-line `CompareChart`, shared decimation, legend). Items #5 + #6 done (2026-06-13): `image` template (CNN + sample-grid PNG, engine v0.5.0) and the hyperparameter form (surgical train.toml editing). **Phase 2 is functionally complete except #7 (PyPI publish)**, which needs the trusted-publisher set up on pypi.org (external, can't be automated here). Parking lot cleared (2026-06-13/14, engine v0.6.0→v0.7.0): early-stopping helper, live GPU-memory line, per-run notes/tags/pin, pause/resume, auto-open-on-train setting, and self-contained HTML run-report export. Companion doc to [PLAN.md](PLAN.md) / [ROADMAP.md](ROADMAP.md).

A hobby-grade ML workbench inside Nexis: create, train, and run inference on **small models** trained on **small data**, with live auto-generated graphs (loss curves, accuracy, confusion matrices, sample predictions). This is a personal-experimentation tool — *not* an attempt to compete with hosted LLM providers, and not a production MLOps platform.

---

## The three decisions up front

### 1. What category is this? → **Companion tool + first-party plugin** (the LSP model)

Nexis already has the exact pattern this needs: the app ships a thin client (LSP proxy, DAP debugger, git, formatters) and the heavy tool lives *outside* the binary, detected at runtime, with a graceful "X not installed → install with …" state when missing (IDEAS.md item A7).

The ML suite is the same shape:

- **Inside Nexis (this repo):** a first-party plugin (`nexis.ml`) registered in `src/plugins/index.ts` like `python` and `containers` — panel UI, live charts, run browser, inference playground, and the protocol client that spawns/talks to the engine.
- **Outside Nexis (separate repo):** the **engine** (`nexis-ml`) — the thing that actually imports an ML framework, loads datasets, runs training loops, and serves inference. Installed separately, versioned separately.

Why not compile it in:
- The roadmap's hard limits: **<10 MB binary**, "every dependency earns its place." Any real ML framework (libtorch ≈ 2 GB, ONNX Runtime ≈ 20–60 MB, even pure-Rust `burn` with a wgpu backend) blows the budget instantly.
- "No extension marketplace" is a stated hard limit, but the roadmap explicitly carves out *"maybe narrow AI tool bundles someday."* This is exactly that: a narrow, first-party, single-purpose bundle — not arbitrary third-party plugins.
- The plugin system is compiled-in pure TypeScript (`src/lib/plugins/types.ts` forbids dynamic imports from disk), so the "downloadable" part can only ever be the engine, never the UI. That's fine — it's how LSP servers work too.

### 2. Separate repo or not? → **Engine: separate repo. Plugin UI: this repo.**

| Piece | Lives in | Why |
|---|---|---|
| `nexis-ml` engine (training/inference runtime, CLI) | **New repo** `nexis-ml` | Different release cadence, different toolchain (Python first), doesn't bloat Nexis CI or the app bundle, independently usable from a plain terminal |
| `nexis.ml` plugin (panels, charts, protocol client) | **This repo**, `src/plugins/ml/` + `src/modules/ml/` | Plugin system is compiled-in; UI rides the normal Nexis release train |
| Protocol spec (the contract between them) | **This repo**, this file (section below) is the source of truth; the engine repo vendors a copy | Nexis is the consumer; breaking the contract breaks the app |

The engine is also useful standalone (`nexis-ml train` in any terminal prints metrics as text), which is good discipline: the protocol stays honest because the engine can't assume Nexis is on the other end.

### 3. What does the engine run on? → **Python/PyTorch first; protocol designed so a Rust sidecar can implement it later**

Researched options (June 2026):

| Option | Train | Infer | Verdict for hobby use |
|---|---|---|---|
| **Python + PyTorch** | ✅ best-in-class | ✅ | **Phase 1 choice.** Full freedom to write/tweak architectures in `train.py` — which *is* the hobby. Endless tutorials. Nexis already detects Python envs (`src-tauri/src/modules/python.rs`, `usePythonEnv`) |
| **Rust + `burn`** (0.20, Jan 2026: CubeCL kernels for CUDA/ROCm/Metal/Vulkan/WebGPU) | ✅ real training support, wgpu = GPU on any Windows box without CUDA toolchain | ✅ | **Phase 3 option.** Single ~30 MB downloadable exe, zero Python required — the true "downloadable add-on" feel. But custom architectures mean recompiling or a declarative layer-config DSL, which caps experimentation. Pre-1.0 API churn |
| **Rust + `candle`** (0.9.x) | ⚠️ exists but inference-focused; reported 3–4× slower than PyTorch on GPU for some workloads | ✅ strong (GGUF/quantization, HF integration) | Inference-only candidate, not the trainer |
| **Rust + `ort`** (ONNX Runtime bindings) | ⚠️ training is niche | ✅ fast, broad hardware | Good Phase-2/3 option for *running* exported `.onnx` models without Python |

The deciding argument: the user-visible core of this feature is **writing a small model and watching it learn**. PyTorch is where a hobbyist can copy a tutorial, edit three lines, and rerun. A Rust engine would make "create your own model" mean either recompiling a sidecar or being boxed into a config-file DSL. So: Python engine first, and because the protocol is just NDJSON over stdio (below), a `burn`-based single-binary engine can be added later for the "no Python on this machine" install path without touching the Nexis UI.

Hardware expectations: small models on small data train fine on CPU. If the user has an NVIDIA card, the engine uses CUDA-enabled torch when present; otherwise CPU. No GPU plumbing in Nexis itself.

---

## Architecture

```
┌────────────────────────── Nexis (this repo) ──────────────────────────┐
│  src/plugins/ml/            plugin registration (panel, statusbar,    │
│                             commands)                                 │
│  src/modules/ml/            MlPanel, RunList, LiveCharts,             │
│                             InferencePlayground, useMlStore (zustand) │
│                             lib/engine-bridge.ts  (spawn + NDJSON)    │
└────────────────┬──────────────────────────────────────────────────────┘
                 │ Tauri IPC (reuse shell/background.rs spawn + stream)
┌────────────────▼──────────────────────────────────────────────────────┐
│  Rust: spawn `nexis-ml <cmd> --nexis-protocol` with hide_console();   │
│  stream stdout lines to JS as events; stdin for control msgs          │
└────────────────┬──────────────────────────────────────────────────────┘
                 │ NDJSON over stdio (one JSON object per line)
┌────────────────▼───────────── nexis-ml (separate repo) ───────────────┐
│  Python package (PyPI). CLI: new / train / infer / serve / runs / ui  │
│  PyTorch training loop harness, dataset loaders, project templates    │
│  Run store: <project>/.nexis-ml/runs/<run-id>/  (JSONL + artifacts)   │
└───────────────────────────────────────────────────────────────────────┘
```

No long-lived daemon in Phase 1. Each training run is one child process that streams events and exits. Inference is either one-shot (`infer`) or a short-lived `serve` process the playground keeps open while its panel is visible.

---

## The protocol (source of truth)

Transport: **NDJSON over stdio** — same family as the LSP/DAP proxies already in the app, but line-delimited instead of `Content-Length` framing (simpler, and the engine is trusted local code we install). Every line the engine writes to stdout while `--nexis-protocol` is set is one JSON object:

```jsonc
{ "ev": "run.started",  "run": "2026-06-11-1432-mnist", "config": { /* hyperparams */ }, "totalEpochs": 10, "device": "cuda:0" }
{ "ev": "metric",       "run": "…", "step": 120, "epoch": 1, "name": "loss/train", "value": 0.482 }
{ "ev": "metric",       "run": "…", "step": 120, "epoch": 1, "name": "acc/val",    "value": 0.911 }
{ "ev": "epoch",        "run": "…", "epoch": 1, "of": 10 }
{ "ev": "artifact",     "run": "…", "kind": "confusion-matrix", "path": ".nexis-ml/runs/…/cm-epoch1.json" }
{ "ev": "artifact",     "run": "…", "kind": "image-grid",       "path": ".nexis-ml/runs/…/samples-epoch1.png" }
{ "ev": "sample",       "run": "…", "input": "…", "output": "…" }          // e.g. text generation preview
{ "ev": "log",          "run": "…", "level": "info", "msg": "…" }
{ "ev": "run.finished", "run": "…", "status": "ok" | "error" | "cancelled", "summary": { "best": { "acc/val": 0.94, "epoch": 7 } } }
```

Control messages on stdin: `{ "cmd": "cancel" }` (graceful stop + checkpoint), `{ "cmd": "pause" }` / `{ "cmd": "resume" }` (stretch).

Rules:
- Unknown `ev` types must be ignored by the client; unknown fields ignored by both sides (forward compatibility — same rule as the plugin API types).
- Metrics are append-only and also written by the engine to `runs/<id>/metrics.jsonl`, so the Nexis run browser can render **finished/historical runs without the engine running** by reading the file directly (fs IPC already exists).
- Artifacts are files on disk, referenced by path — the protocol never inlines binary data. Charts panel loads them via the existing fs/image-viewer plumbing.
- Engine prints human-readable progress to stderr; stdout is protocol-only when `--nexis-protocol` is set.

This mirrors what trackio/W&B-style trackers do (local-first JSONL/SQLite run store + dashboard), minus the dashboard server — Nexis *is* the dashboard.

---

## The engine: `nexis-ml` (separate repo)

Python ≥3.10 package, `pip install nexis-ml` (or `uv tool install`). Torch is a declared dependency; CPU wheel by default, user swaps in CUDA wheel if they want.

CLI surface (also usable standalone in any terminal):

- `nexis-ml new <template> <dir>` — scaffold a project. Templates planned:
  - `tabular` — CSV in, MLP classifier/regressor (the "my spreadsheet, what predicts what" project)
  - `image` — folder-of-images-per-class, small CNN (the MNIST/pets project; MNIST starter auto-downloads)
  - `textgen` — char-level / small-BPE tiny transformer trained on your own .txt files (the "tiny GPT on my journal" project — *the* canonical hobby build)
  - `finetune` — stretch: LoRA on a small open model
- `nexis-ml train [--config train.toml]` — runs `train.py`, streams protocol events
- `nexis-ml infer --run <id> --input …` — one-shot inference from a checkpoint
- `nexis-ml serve --run <id>` — stdin/stdout inference loop for the playground
- `nexis-ml runs [--json]` — list runs + summaries
- `nexis-ml export --run <id> --onnx` — stretch: export to ONNX (door-opener for a later Rust/`ort` inference path)

Project layout the scaffold produces:

```
my-experiment/
  train.py          # the user's model + loop, calling the nexis_ml harness
  train.toml        # hyperparams (epochs, lr, batch size…) — editable in Nexis
  data/             # user drops data here
  .nexis-ml/runs/   # run store: config.json, metrics.jsonl, checkpoints, artifacts
```

Key design rule: **`train.py` is the user's file.** The harness is a library (`from nexis_ml import track, harness`) that wraps a normal PyTorch loop with metric emission, checkpointing, and cancel handling — it must never hide the model definition. Editing the architecture in the Nexis editor and hitting "Train" again is the core loop of the whole feature.

Auto-generated artifacts by template (engine-side, no user code):
- all: loss/metric curves data (from `metrics.jsonl`), LR schedule
- `tabular`/`image`: confusion matrix per eval, per-class precision/recall
- `image`: sample-prediction image grid per epoch
- `textgen`: generated-sample text snapshot per epoch (watching gibberish become words is the payoff)

---

## The Nexis side: plugin `nexis.ml` (this repo)

Contributions (all through the existing `PluginAPI`):
- **Panel** ("ML", bottom or sidebar): three tabs/sections —
  1. **Runs** — list from `runs/` dirs in the workspace (live ones first), summary stats, compare toggle
  2. **Charts** — live metric curves for the selected run(s); confusion matrix + image-grid artifact viewers
  3. **Playground** — prompt/input box → `serve` process → output; image upload for `image` template
- **Status bar item** — training pill (run name, epoch n/m, latest loss, spinner), click → opens panel. Same pattern as `PythonEnvPill`.
- **Commands** — `ml: new project`, `ml: train`, `ml: cancel`, `ml: open runs panel`.
- **Detection / graceful degradation** — `nexis-ml --version` probe (per A7): panel renders "nexis-ml not installed → `pip install nexis-ml`" with a copy button, plus picks up the active Python env from the python plugin's `python:env-changed` event so it installs/runs in the right venv.

Charts rendering: no chart dependency exists today. Recommendation: **uPlot** (~10 KB gzipped, zero deps, canvas-based, built exactly for high-frequency streaming line charts) for the metric curves; confusion matrix is a trivial hand-rolled grid; image grids reuse the image-viewer module. If uPlot feels like too much, a hand-rolled SVG polyline is acceptable for Phase 1 but will struggle past a few thousand points per series — decide at implementation time. Either way the chart must **decimate**: cap points-per-series rendered (e.g. min/max binning to ~2× pixel width) so a 100k-step run can't hang the renderer.

State: `useMlStore` (zustand) holding runs, live metric buffers, engine status.

---

## Phases

**Phase 1 — train + watch ✅ (shipped in 1.19.0, engine v0.2.0)**
What shipped exceeded the original Phase 1 plan: `tabular` template; `new/train/runs/replay/env`; protocol v1 with device field; ML Lab panel (progress bar, plain-language status, friendly metric names, hero chart, run browser); one-click engine install with CPU/CUDA flavors; in-panel Create & train; device auto/cpu/gpu with job-size heuristic; status pill. Verified end-to-end on CPU and an RTX 4070 SUPER.

**Phase 2 — infer + richer graphs (in progress)**
Rough priority order, biased toward visible payoff per effort:
1. ✅ **`textgen` template** (engine v0.3.0, 2026-06-13) — hand-rolled char-level tiny GPT (nanoGPT-flavored) over any `.txt`, ships a small bundled corpus, streams `loss/train`/`loss/val`/`perplexity/val` and a `sample` event per epoch; best/last checkpoints embed the vocab (so a later `infer`/`serve` can decode). Nexis side: store buffers `sample` events (live + when replaying a historical run via `collectSamples`), MlPanel shows a "Generated text" snapshot view (scrub passes with ‹ ›) above the charts, and the create card picks between `tabular`/`textgen`. `perplexity/val` has a friendly label.
2. ✅ **Confusion-matrix viewer** (2026-06-13) — the per-epoch `confusion-matrix` artifact (written by `tabular`) is now read via `fs_read_file` and rendered as a colored grid in the panel (emerald diagonal = correct, rose = misclassified, alpha by count), with overall accuracy and the pass number. `lib/artifacts.ts` parses/validates the JSON defensively; `protocol.ts` `latestConfusionMatrix` tracks the newest one (live + historical); the artifact path is rebuilt from the run dir so it survives a moved project. Other artifact kinds still log until they get viewers.
3. ✅ **Inference playground** (engine v0.4.0, 2026-06-13) — `infer` (one-shot) + `serve` (NDJSON stdin/stdout loop) engine commands, loading `checkpoints/best.pt`. Built-in predictors **rebuild the template model from the sizes saved in the checkpoint** (`inference.py`), so train.toml size edits work; editing the model *code* is reported as an error, not a crash. Serve opens with a `ready` event (template + device + meta) then answers one JSON request per line (`prediction`/`error`). Rust: `serve` added to the spawn allowlist + new `ml_stdin` command. Nexis: serve session in the store (routed off `ml:proto` by sid via `serveOwns`/`_applyServeProto`), a Playground panel section — textgen prompt→continuation with a temperature dial, tabular feature form→class + probability bars — started per-run and torn down on navigation (frees GPU VRAM).
4. ✅ **Run comparison** (2026-06-13) — check 2+ runs in the Past-runs list to overlay them: each loads into a module-level `compareData` buffer (runId → metric → series), and a multi-line `CompareChart` draws one colored line per run per metric on a shared domain (reusing the existing min/max decimation), with a color legend. Comparison replaces the single-run views while active; cleared on project switch. Store logic (`toggleCompare`/`clearCompare`, distinct-color assignment) is unit-tested in `store.test.ts`.
5. ✅ **`image` template** (engine v0.5.0, 2026-06-13) — folder-per-class CNN (`nexis-ml new image`). Streams loss + accuracy, a per-epoch confusion matrix (reuses #2's viewer) and a **sample-prediction grid** PNG (green/red borders). Ships four pattern classes generated by a stdlib-only PNG writer so `new image` stays dependency-free; training adds `Pillow` (now in the `torch` extra). Nexis renders the grid via `convertFileSrc` (same asset path as the image viewer); the create card offers the image template. Image-model inference isn't in the playground yet (serve reports this cleanly).
6. ✅ **Hyperparam form** (2026-06-13) — a collapsible "Hyperparameters" section renders the editable keys present in `train.toml` (epochs/lr/batch/device/hidden/context/embed/… — auto-adapts per template) with Save and Save & train. `lib/toml-edit.ts` does *surgical* value replacement (preserves comments, alignment, and CRLF — no full re-serialize), `lib/config.ts` reads/writes via the atomic `fs_write_file`. Tested in `toml-edit.test.ts`.
7. **PyPI publish** — workflow is in the engine repo; needs the trusted publisher configured on pypi.org. Until then the panel's install button only works where the engine is already reachable

**Phase 3 — the "downloadable extension" install path (started 2026-06-14)**
A `burn`-based (or `ort`-based, for ONNX inference) single-binary engine implementing the same protocol, downloaded like an LSP server, for machines without Python. Declarative model config only (MLP/CNN presets). Also: `export --onnx`. Only build this if Phase 1/2 actually get used.

**Foundation slice shipped** (new repo `nexis-ml-rs`, local: `E:\nexis-ml-rs`, v0.1.0): a Rust single-binary engine (binary named `nexis-ml` for drop-in detection) implementing **protocol v1 NDJSON + the exact run-store layout**, with CLI `--version`/`env`/`new`/`train`. The `train` command currently drives a built-in **linear classifier** on synthetic data (pure Rust, no framework) through the full `Run` lifecycle (run.started → metric/epoch → confusion-matrix artifact → run.finished). **Compatibility proven**: a Rust-produced run is listed by the Python `nexis-ml runs` unchanged. `cargo test`/`clippy -D warnings`/`fmt` clean. **M2 done** (2026-06-14, v0.2.0): `train` now runs a real **`burn` MLP** (ndarray/CPU, autodiff, Adam + cross-entropy, minibatches) — loads a CSV via `[data] path`/`target` (the "my spreadsheet" case) or synthetic data; trains to ~0 loss on the Python tabular `example.csv`, and the Python `nexis-ml runs` reads the burn-produced run unchanged. **Run-control parity** (2026-06-14, v0.2.1): the Rust harness now honors the same stdin commands as Python — `{cmd:cancel}` (breaks cleanly, finishes "cancelled", keeps the checkpoint) and `{cmd:pause}`/`{cmd:resume}` (at the epoch boundary) — so the panel's Stop/Pause buttons work against either engine. **M3 done** (2026-06-14, v0.3.0): `model.rs` is generic over the backend and picks CPU (ndarray) or **GPU via burn's `wgpu`** from `[train] device` (`auto`/`cpu`/`gpu`; `auto` probes for an adapter and degrades to CPU on a driverless box). The resolved `device` rides on run.started/summary, a per-epoch `mem/gpu_mb` line reports the wgpu client's `bytes_in_use`, and `nexis-ml env` reports `backend: "wgpu"` when a GPU is present. Verified on the RTX 4070 SUPER: `device=auto` trains on GPU to acc 1.0 and the Python `nexis-ml runs` reads the GPU run unchanged — wgpu needs no vendor toolchain (the "GPU on any box" win). **M4 done** (2026-06-14, v0.4.0): the model is declared in `train.toml` — `[data] path` picks the kind (a CSV → variable-depth **MLP**, `hidden = 16` or `[64, 32]`; a folder of class sub-folders → **CNN** over images via the `image` crate, `conv1`/`conv2`/`hidden`), each emitting the same artifacts as the Python templates (confusion-matrix; image-grid for the CNN). **M5 done** (2026-06-15, v0.5.0): `nexis-ml export --onnx [dir]` writes a tabular MLP to ONNX via a dependency-free hand-rolled protobuf writer (`src/onnx.rs`, since burn has no native export) — raw features in, logits out, standardization baked in; verified against onnxruntime for an exact prediction match (CNN export is a follow-up). Backend RNG is now seeded from `[train] seed`, so runs/exports are reproducible. **M6 done** (2026-06-15): Nexis integration — `ml_managed_engine_path` + `ml_download` (https → managed dir under app-local-data → `--version` verify) Tauri commands, and the panel's detection now appends the managed standalone engine to its candidates (the "no Python on this machine" path, mirroring LSP-server download). Remaining hookup: a published `nexis-ml-rs` release URL + a panel "download engine" button. Phase 3 (M1–M6) complete.

**Parking lot** — ✅ all cleared (2026-06-13/14)
- ✅ `pause`/`resume` protocol commands — harness honors `{cmd:pause|resume}` on stdin at the epoch boundary (`run.paused`, engine v0.6.0); Pause/Resume buttons in the panel via `ml_stdin`, optimistic `paused` state + indicator.
- ✅ Per-run notes/tags in the run browser; pin a "baseline" run — `notes.json` per run (`lib/notes.ts`), shown + editable in the run row (★ pin floats to top, ✎ note/tags editor).
- ✅ Auto-open the panel when training starts — `mlAutoOpenOnTrain` pref via `writePref()` (pitfall #2); trigger lives in the always-mounted status pill; toggle in the panel footer.
- ✅ Live GPU memory line while training on CUDA — harness auto-emits `mem/gpu_mb` per epoch (engine v0.6.0); friendly "GPU memory" label.
- ✅ Early-stopping helper in the harness (`run.should_stop(patience=...)`) (engine v0.6.0).
- ✅ Export a run as a self-contained HTML report — `nexis-ml export --run <id>` (engine v0.7.0, `report.py`): inline SVG charts + summary + confusion matrix + base64 sample grid + samples + config; one-click "⤓ Export HTML report" in the panel (reveals the file).

**Explicit non-goals (all phases)**
- No cloud anything: no hosted training, no telemetry, no accounts (roadmap non-negotiable)
- No distributed/multi-GPU, no hyperparameter sweep orchestration
- No model zoo browser / marketplace
- Not a notebook replacement — the notebook viewer already exists; this is the *run* loop, not the *explore* loop

---

## Pitfalls to carry over (from CLAUDE.md)

- **#4 / #1D — `hide_console`:** every engine spawn (`probe --version`, `train`, `serve`) is a new `Command::new()` on Windows and **must** go through `crate::modules::proc::hide_console`, or it can blank an active terminal. If the spawn path reuses `shell/background.rs`, this is already handled — prefer that.
- **#1C — `workspace_authorize`:** if the engine is ever spawned with a user-picked project dir as cwd, authorize it first or the spawn fails silently.
- **#10 — memoized promise rejection:** the engine-bridge will memoize "engine detected / serve session open" promises; a rejected promise cached in a Map poisons all later calls. Delete-on-reject, same fix as `getSessionShell`.
- **#14 — Zustand selector stability:** the charts/runs store is exactly the shape that invites `.filter()`-in-selector infinite loops. Selectors return stable refs; derive in render or use `useShallow`.
- **#7-adjacent — backpressure:** a tight training loop can emit thousands of metric lines/sec. The bridge must batch (flush to the store at ~10 Hz max) and the store must cap in-memory points per series (decimate; full fidelity stays in `metrics.jsonl`).
- **#2 — settings:** any ML-suite preference goes through `writePref()`.
- **Atomic writes:** engine writes `metrics.jsonl` append-only and checkpoints via tmp+rename (same rationale as `write_if_changed`) so a crash mid-write can't corrupt a run.

---

## Open questions

1. Plugin UI placement: bottom panel vs sidebar — probably bottom (charts want width).
2. uPlot vs hand-rolled SVG for curves (lean uPlot; measure first).
3. Does `serve` warrant a persistent session manager like `sessionShells`, or is per-playground-open fine? (Start with per-open.)
4. Engine repo name: `nexis-ml`? Working name used throughout this doc.
5. Should `nexis-ml runs` data live in the workspace (`.nexis-ml/`, gitignorable, portable) or a global dir? Spec says workspace-local — revisit if it annoys.

---

## Research notes (June 2026)

- Burn 0.20 (Jan 2026) added CubeCL multi-platform kernels (CUDA/ROCm/Metal/Vulkan/WebGPU); training-first design, wgpu backend runs on any modern GPU without vendor toolchains. ([Phoronix](https://www.phoronix.com/news/Burn-0.20-Released), [tracel-ai/burn](https://github.com/tracel-ai/burn))
- Candle 0.9.x is inference-lean (GGUF/quantization strong, training exists but secondary; 3–4× slower than PyTorch on GPU in some comparisons). ([huggingface/candle](https://github.com/huggingface/candle), [Burn vs Candle comparison](https://dasroot.net/posts/2026/04/rust-machine-learning-burn-vs-candle-framework-comparison/))
- `ort` (ONNX Runtime Rust bindings) supports minimal builds for size-sensitive desktop apps — the natural later path for Python-free inference of exported models. ([pykeio/ort](https://github.com/pykeio/ort))
- Trackio (HF, May 2026) validates the local-first run-store design: wandb-compatible API, SQLite/JSONL storage, local dashboard. We mirror the storage idea but render in Nexis instead of a Gradio server. ([gradio-app/trackio](https://github.com/gradio-app/trackio), [HF blog](https://huggingface.co/blog/trackio))
