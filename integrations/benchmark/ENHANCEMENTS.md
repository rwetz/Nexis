# Enhancements & Roadmap

A running list of ideas and follow-ups for Nexis Benchmark. Roughly ordered by
value within each section. `[x]` = shipped.

## Backends

- [x] **llama.cpp / GGUF backend** — real GGUF inference by shelling out to the
      prebuilt `llama-bench` (`-o json`), parsed into throughput + latency
      (`src-tauri/src/llama.rs`). **No cmake / source build** — the user locates the
      prebuilt binary in the Backends panel (auto-detected if on PATH).
      _Still TODO: bundle a `llama-bench` build; expose `-ngl` GPU-layer control._
- [ ] **ONNX GPU execution providers** — enable CUDA / DirectML / CoreML via `ort`
      features so the ONNX backend can benchmark CPU *vs* GPU on the same model.
- [ ] **nexis-ml-rs real inference** — when the engine gains an arbitrary-model
      inference path, swap the training-throughput benchmark for true inference so it
      compares apples-to-apples with ONNX Runtime. Until then, keep the (honest)
      training-throughput micro-benchmark.
- [ ] **candle / burn inference backend** — a pure-Rust inference path as another
      comparison point (and dogfoods the Nexis ML stack).
- [ ] **Backend warm-pool** — keep a loaded session alive across runs to separate
      cold-start cost from steady-state throughput.

## Benchmark fidelity

- [ ] **Real accuracy** — run classification/embedding against a bundled standard
      dataset (e.g. SST-2 sample, STS-B) so the accuracy column is real, not blank.
- [x] **Real GGUF metadata** — header parsing for arch, parameter count, quant
      (`file_type`), and context length, shown in the model card (`src-tauri/src/gguf.rs`).
      _Still TODO: ONNX metadata (opset, producer, IR version)._
- [ ] **Token-aware generation** — for true generation backends, measure first-token
      latency and inter-token latency from a streaming decode, not a single forward pass.
- [ ] **Better memory attribution** — ONNX runs in-process, so peak memory is an RSS
      delta today. Investigate ORT allocator stats / arena metrics for a cleaner figure.
- [ ] **Input realism** — let the user supply a sample input (text / image / tensor)
      instead of synthesized zeros/ones, for representative latencies.
- [x] **Statistical rigor (partial)** — per-cell coefficient of variation with a
      "noisy" flag, computed from the latency samples. _Still TODO: confidence-interval
      bands; auto-pick run count until the median stabilizes._

## UX

- [x] **Run history** — completed runs persist (localStorage) with a history menu to
      reload past runs. _Still TODO: diff / side-by-side compare._
- [x] **More charts** — latency distribution strips per cell, a throughput-vs-latency
      Efficiency Map with a Pareto frontier, and a leaders summary strip.
- [x] **Config presets** — save / apply / delete named benchmark protocols.
- [ ] **Command palette (⌘K)** — wire add-model, run, switch-metric, export.
- [x] **Keyboard shortcuts (partial)** — run (⌘/Ctrl+↵), stop (Esc), toggle theme (t).
      _Still TODO: switch-metric._
- [ ] **Settings window** — configurable simulated/standardized workload size, thread
      counts, default device.
- [ ] **Empty/error polish** — richer error surfaces when a model fails to load
      (bad opset, missing input), with actionable hints.

## Data & export

- [x] **JSON export** — full run + model metadata exported alongside the CSV.
      _Still TODO: a self-contained HTML report with charts._
- [x] **Clipboard** — copy the results table as a Markdown table.
- [ ] **Compare exports** — import two result sets and diff them.

## Packaging & distribution

- [ ] **Bundle `onnxruntime.dll`** as a Tauri resource so `tauri build` produces a
      working installer (dev already works via `ort`'s `copy-dylibs`).
- [ ] **macOS / Linux builds** — verify the borderless chrome overrides and ORT
      binaries on the other platforms; add the Linux config if missing.
- [ ] **Code signing / notarization** for distributable installers.
- [ ] **Auto-update** via the Tauri updater.

## Engineering

- [x] **CI** — GitHub Actions (`.github/workflows/ci.yml`): `tsc` + `vite build`, and
      `cargo check` + `cargo test` (the ONNX smoke test runs when `ONNX_SMOKE_MODEL` is set).
- [ ] **Frontend tests** — unit-test the store reducers and the CSV/metric formatters.
- [ ] **Telemetry-free crash logging** — surface Rust panics from the benchmark thread
      to the UI instead of silently ending a run.
- [ ] **Cancellation hardening** — confirm GGUF/long-running backends honor cooperative
      cancel + process-tree kill on Windows.
