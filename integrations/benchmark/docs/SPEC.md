---
created: 2026-06-22
tags:
  - status/raw
  - type/project
---

# Local Model Benchmark GUI

## The Idea
A desktop app for benchmarking local AI models. Drop in ONNX or GGUF models, select a task (text generation, classification, embedding), run standardized benchmarks, and see throughput, latency, memory usage, and accuracy side by side.

## Why It's Cool
There's no clean standalone tool for this. llama.cpp has a CLI benchmark. ONNX Runtime has scripts. This wraps it all in a GUI with beautiful charts — and since you're building nexis-ml-rs, you'd be benchmarking your own engine vs alternatives.

## Tech
**Tauri + React** — nexis-ml-rs as one backend, llama.cpp and ONNX Runtime as others. Rust IPC to run benchmarks, React for charts and model management.

## Shape
- Model library: drag-drop ONNX/GGUF files, auto-detect task type
- Benchmark suite: tokens/sec, first-token latency, memory peak, accuracy on standard datasets
- Backend selector: run the same model through nexis-ml-rs vs ONNX Runtime vs CPU
- Results dashboard: bar charts comparing models and backends
- Export: CSV of results, shareable benchmark report

## Next Step
- [ ] ONNX Runtime + nexis-ml-rs as benchmarkable backends
- [ ] Define benchmark protocol: N runs, warm-up, median latency
- [ ] Model file browser + drag-drop
- [ ] Results comparison chart UI
