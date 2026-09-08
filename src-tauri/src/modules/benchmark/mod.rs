// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

//! Benchmark — measuring local models across inference backends.
//!
//! Absorbed from the standalone `nexis-benchmark` app. The harness arrives
//! intact: `backend` is the `Engine` trait plus the registry of
//! implementations, `bench` drives a job's model x backend matrix on a worker
//! thread and streams `bench://progress` / `bench://result`, and `onnx`,
//! `llama`, `ml_engine` and `simulate` are the engines themselves. `gguf`
//! reads GGUF headers so a dropped file can describe itself; `scan` turns
//! paths into model entries; `domain` is the shared vocabulary.
//!
//! What changed on the way in:
//!
//! - Commands are namespaced `bench_*` and the ones that walk the filesystem
//!   or spawn a process are `async` through [`super::heavy`]. In a
//!   single-purpose app a blocking command only stalled itself; here it stalls
//!   the terminal.
//! - `AppState` became [`state::BenchState`], and its mutex recovers from
//!   poisoning rather than unwrapping (pitfall #8).
//! - `write_text_file` is gone. See `commands.rs`.
//! - Every subprocess is built with [`crate::modules::proc::command`], so the
//!   engine probes and `taskkill` no longer flash a console -- which, next to
//!   a live ConPTY, is not cosmetic (pitfalls #1D / #4).
//! - The nexis-ml backend resolves the engine ML Lab manages before it looks
//!   at `PATH`, so the two panels measure the same binary.
//!
//! ## On bundling ONNX Runtime
//!
//! `onnx.rs` runs real inference through the `ort` crate, which pulls a
//! prebuilt ONNX Runtime at build time. That is by far the largest single
//! thing in the binary and it reverses the position `docs/ML_SUITE.md` argued
//! for -- no bundled inference engine. The reversal is deliberate and is
//! written up in `docs/vault/decisions/bundling-onnx-runtime.md`: the argument
//! that ruled it out was a size budget that no longer exists, and a benchmark
//! tool whose flagship backend is a simulation is not a benchmark tool.

pub mod backend;
pub mod bench;
pub mod commands;
pub mod domain;
pub mod gguf;
pub mod llama;
pub mod ml_engine;
pub mod onnx;
pub mod scan;
pub mod simulate;
pub mod state;
