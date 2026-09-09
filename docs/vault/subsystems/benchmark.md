---
type: subsystem
description: Benchmarking local ONNX/GGUF models across inference backends — Rust harness behind an Engine trait, streaming results into an ML Lab panel.
---

# Benchmark

The ML Lab sidebar panel that measures local models: drop in `.onnx` or `.gguf` files, pick backends, run the model x backend matrix, and compare throughput, latency, peak memory and accuracy side by side. Results stream live over Tauri events.

Absorbed in v1.27.0 from the standalone `nexis-benchmark` app; history grafted in. See [[absorbing-the-nexis-apps]].

## Backends

| Backend | State |
|---|---|
| `ONNX Runtime` | real inference, via the `ort` crate and a linked prebuilt ORT — see [[bundling-onnx-runtime]] |
| `llama.cpp` | real GGUF inference via a `llama-bench` binary the user locates |
| `nexis-ml-rs` | real training throughput on a standardized workload (the engine has no arbitrary-model inference path) |
| `Simulated` | deterministic synthetic metrics, for UI and protocol work |

The UI labels every result's provenance with a `real` / `sim` badge plus a per-run note. Keep that: a benchmark that does not say what it measured is worse than no benchmark.

## Key files

- `src-tauri/src/modules/benchmark/mod.rs` — module overview and what changed on absorption
- `src-tauri/src/modules/benchmark/backend.rs` — the `Engine` trait, the registry, nexis-ml discovery
- `src-tauri/src/modules/benchmark/bench.rs` — the matrix runner; owns its worker thread, emits `bench://progress` / `bench://result`
- `src-tauri/src/modules/benchmark/commands.rs` — the `bench_*` command surface
- `src-tauri/src/modules/benchmark/{onnx,llama,ml_engine,simulate}.rs` — the four engines
- `src-tauri/src/modules/benchmark/gguf.rs` — GGUF header reading, so a dropped file describes itself
- `src/modules/benchmark/BenchmarkPanel.tsx` — the panel shell
- `src/modules/benchmark/store.ts` — persisted config/history plus live run state
- `src/modules/benchmark/lib/api.ts` — the single IPC boundary

## Invariants / gotchas

- **A run outlives the panel.** The engine keeps working when the sidebar view is switched away or the frontend hot-reloads. The store persists `jobId` and `init()` asks `bench_is_running` rather than assuming the run stopped — assuming would let a second job start on top of the first. The event listeners in `api.ts` are module-scoped for the same reason, not tied to a component lifecycle.
- **The nexis-ml backend resolves ML Lab's managed engine before `PATH`.** `ml::managed_engine_exe` is `pub(crate)` for exactly this. A deliberate install through [[ml-lab]] is a stronger statement than whatever is on `PATH`, and the two panels disagreeing about which binary they measure makes every cross-panel comparison meaningless. The path is resolved once per job, not per cell.
- **`BenchState`'s mutex recovers from poisoning** (`unwrap_or_else(|e| e.into_inner())`). In the standalone app a panic here killed an app that only benchmarked; here it lands on a Tauri worker thread and takes the terminal with it. Pitfall #8.
- **`bench_list_backends`, `bench_scan_models` and `bench_probe_llama` must stay `async` + `heavy()`** — they walk `PATH`, read GGUF headers, and spawn binaries to read versions.
- **Export goes through `fs_write_file`.** The standalone app had its own `write_text_file` command; it skipped the atomic staging and the WSL rename fallback every other write in Nexis gets (pitfall #17). Do not reintroduce a second write path.
- **`ort` is the only rc-pinned dependency in the tree** and by far the largest thing in the binary. It is the first suspect in any size investigation. Its `download-binaries` feature fetches at *build* time, so a cold offline build now needs network.
- **ORT is deliberately CPU-only** (`default-features = false`, dropping `copy-dylibs`). The default feature set copies ORT's shipped dylibs next to the binary — on Windows `DirectML.dll`, for an execution provider `onnx.rs` never requests — and `tauri build` does not bundle a stray sibling DLL, so a dev build and an installed build would have differed. Do not re-enable `copy-dylibs` without also solving the per-platform bundling; see [[bundling-onnx-runtime]].
- **`useFileDrop` listens window-wide** — Tauri has no per-element drag-drop target. It filters by `.onnx`/`.gguf` and only claims what it recognises, and only while the panel is mounted.
- **The layout responds to its container.** A narrow sidebar stacks models, engines, workload, run plan, and results; a wide dedicated window makes those three setup areas a single board above the results canvas. Do not use viewport breakpoints here: a narrow panel can live inside a wide Nexis window.
- **Motion marks benchmark state, not every option.** Setup cards stagger only when the workspace enters, the running plan carries a slow brand scan, and a finished matrix cell gets one arrival flash. The classes are the data-motion primitives from [[icon-and-motion-system]] and are all disabled for reduced-motion users; selection rows and ordinary controls retain their short default transitions.

## See also

- [[bundling-onnx-runtime]] — why ORT is linked in and what it cost
- [[ml-lab]] — shares the engine this panel measures
- [[absorbing-the-nexis-apps]]
