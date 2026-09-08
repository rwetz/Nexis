---
type: decision
description: Nexis links a prebuilt ONNX Runtime for the Benchmark panel, reversing ML_SUITE.md's "no bundled inference engine"; the release size tripwire moves 40 MB to 150 MB
---

# Bundling ONNX Runtime

**Date:** 2026-09
**Status:** active — landed in v1.27.0 with [[absorbing-the-nexis-apps]]

## Context

`docs/ML_SUITE.md` argued, and the ROADMAP's hard limits repeated, that Nexis
would not bundle an inference engine. Two reasons were given, and only one of
them was ever really about size:

1. A byte budget. libtorch is ≈ 2 GB; ONNX Runtime is ≈ 20–60 MB. Against a
   sub-10 MB binary both were disqualifying.
2. A support-surface argument: a bundled engine brings a per-backend build
   matrix and a GPU-driver support surface, and keeping the engine external
   keeps all of that out of this repository.

Absorbing `nexis-benchmark` put the question directly. Benchmark's whole
purpose is measuring local models, and it has four backends:

| Backend | What it is |
|---|---|
| `ONNX Runtime` | real inference, via the `ort` crate |
| `llama.cpp` | real GGUF inference, via a `llama-bench` binary the user locates |
| `nexis-ml-rs` | real training throughput on a standardized workload |
| `Simulated` | deterministic synthetic metrics |

Of those, ONNX Runtime is the only one that runs arbitrary inference on a model
the user supplies without asking them to go find a binary first. Shipping the
panel without it means shipping a benchmarking tool whose out-of-the-box
experience is a simulation labelled `sim`.

## Decision

**Link a prebuilt ONNX Runtime.** `ort = "2.0.0-rc.12"` with its default
`download-binaries` feature, which fetches a prebuilt ORT at build time — no
cmake, no vendored C++ toolchain, no per-platform build matrix in this repo.

**Move the release tripwire from 40 MB to 150 MB.** Deliberately well above
what the binary actually weighs, because the tripwire's job is catching an
accident, not tracking a number.

Three alternatives were considered:

- **A cargo feature, off by default.** Rejected: the default build would
  advertise a backend in its UI that the binary cannot run. A capability the
  UI names and the binary lacks is worse than either having it or not.
- **Drop the ONNX backend.** Rejected for the reason above — it makes the
  panel's default state a simulation.
- **Keep Benchmark a separate app.** Rejected in [[absorbing-the-nexis-apps]]
  for reasons that have nothing to do with size.

## Why the original argument does not survive contact

The size half is simply gone: the budget it depended on was retired in
2026-09, and 60 MB against a loose regression tripwire is a different question
than 60 MB against a 10 MB budget.

The support-surface half is the interesting one, and it turns out to be an
argument about **training**, not about inference. A training engine is where
the per-backend matrix and the GPU-driver surface live — CUDA, ROCm, Metal,
wgpu, each with its own build and its own failure modes. `ort` with
`download-binaries` is a fixed-size, CPU-by-default, prebuilt artifact with
one build path. It has the shape the original argument ruled out only if you
read "inference engine" as a category rather than reading what the category
was actually objecting to.

So the position narrows rather than collapses: **training stays external**
(`nexis-ml` spawned as a separate process, exactly as before), **inference for
measurement is linked in.**

## Consequences

- The Windows release binary goes from ~9.5 MiB to tens of MB. This is the
  single largest thing in the tree and should be the first suspect in any
  future size investigation.
- `ort` is pinned to a release candidate because 2.0 has no final release.
  Revisit on the first stable tag rather than tracking rcs. Note this is the
  only rc-pinned dependency in `src-tauri/Cargo.toml`.
- `download-binaries` fetches at **build** time, which makes a clean build
  network-dependent in a way it was not before. CI already has network; an
  offline `cargo build` from a cold cache does not.
- ORT's own license and the licenses of what it pulls now matter to
  `cargo deny`. If `audit.yml` fails on a license after this change, this is
  why.
- `docs/ML_SUITE.md`'s hard-limits bullet is amended rather than deleted — the
  training conclusion there is still correct and still load-bearing.

## See also

- [[absorbing-the-nexis-apps]] — the change that forced this one
- `docs/ML_SUITE.md` — the position this narrows
- `docs/vault/subsystems/benchmark.md`
