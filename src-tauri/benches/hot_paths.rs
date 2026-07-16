// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝
//
// Criterion microbenchmarks for the Rust hot paths named in the ROADMAP
// hardening backlog. Measure before optimizing — these exist so the
// "Selective TS → Rust migration" and any PTY/grep tuning start from numbers,
// not guesses (benchmark-first culture borrowed from Zed's rope work).
//
// Run:  cargo bench --features bench-internals
// The `bench-internals` feature only re-exports internals for this harness;
// it is never enabled in shipping builds.

use criterion::{criterion_group, criterion_main, BatchSize, Criterion, Throughput};
use nexis_lib::bench_internals::{fs_grep, parse_porcelain_v2, DaFilter};
use std::hint::black_box;

/// Per-chunk work of the PTY reader thread: every byte the child writes flows
/// through `DaFilter::process` before hitting the pending buffer (session.rs).
/// Guards the fast path (chunks with no ESC skip the state machine entirely)
/// and the ANSI-dense worst case.
fn bench_da_filter(c: &mut Criterion) {
    const CHUNK: usize = 8 * 1024; // typical reader read size
    const CHUNKS: usize = 128; // 1 MiB per iteration

    let plain: Vec<u8> = b"The quick brown fox jumps over the lazy dog. 0123456789\n"
        .iter()
        .copied()
        .cycle()
        .take(CHUNK)
        .collect();
    let ansi: Vec<u8> = b"\x1b[32mok\x1b[0m \x1b[1;34mpath/to/file.rs\x1b[0m line\n"
        .iter()
        .copied()
        .cycle()
        .take(CHUNK)
        .collect();

    let mut group = c.benchmark_group("pty_da_filter");
    group.throughput(Throughput::Bytes((CHUNK * CHUNKS) as u64));
    for (name, input) in [("plain_text", &plain), ("ansi_dense", &ansi)] {
        group.bench_function(name, |b| {
            b.iter_batched(
                || (DaFilter::new(), Vec::with_capacity(CHUNK + 64)),
                |(mut filter, mut out)| {
                    for _ in 0..CHUNKS {
                        out.clear();
                        filter.process(black_box(input), &mut out, |_reply| {});
                        black_box(&out);
                    }
                },
                BatchSize::SmallInput,
            );
        });
    }
    group.finish();
}

/// Builds a realistic `git status --porcelain=v2 -z` payload: branch headers
/// plus `entries` ordinary/renamed/untracked records, NUL-separated.
fn synthetic_porcelain(entries: usize) -> String {
    let mut s = String::new();
    s.push_str("# branch.oid 73dff00aa11bb22cc33dd44ee55ff6677889900aa\0");
    s.push_str("# branch.head main\0");
    s.push_str("# branch.upstream origin/main\0");
    s.push_str("# branch.ab +3 -1\0");
    for i in 0..entries {
        match i % 10 {
            // renamed entry: `2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path>` NUL `<origPath>`
            3 => s.push_str(&format!(
                "2 R. N... 100644 100644 100644 abc{i:04} def{i:04} R100 src/modules/new_{i}.ts\0src/modules/old_{i}.ts\0"
            )),
            // untracked
            7 => s.push_str(&format!("? scratch/untracked_{i}.log\0")),
            // ordinary modified entry
            _ => s.push_str(&format!(
                "1 .M N... 100644 100644 100644 abc{i:04} def{i:04} src/modules/terminal/file_{i}.ts\0"
            )),
        }
    }
    s
}

/// Post-subprocess cost of a status refresh: lossy UTF-8 conversion (the
/// pitfall #13 path) + porcelain v2 parsing. Sized like a busy monorepo.
fn bench_git_status_parse(c: &mut Criterion) {
    let text = synthetic_porcelain(5_000);
    let bytes = text.as_bytes().to_vec();

    let mut group = c.benchmark_group("git_status_parse");
    group.throughput(Throughput::Bytes(bytes.len() as u64));
    group.bench_function("porcelain_v2_5k_files", |b| {
        b.iter(|| {
            let parsed = parse_porcelain_v2(black_box(&text));
            black_box(parsed.files.len())
        });
    });
    group.bench_function("lossy_utf8_then_parse", |b| {
        b.iter(|| {
            let s = String::from_utf8_lossy(black_box(&bytes));
            let parsed = parse_porcelain_v2(&s);
            black_box(parsed.files.len())
        });
    });
    group.finish();
}

/// End-to-end `fs_grep` over a synthetic tree: walker + regex matcher +
/// per-file search, the same code the workspace search UI calls.
fn bench_fs_grep(c: &mut Criterion) {
    // 200 files × ~50 lines, ~10% matching lines.
    let dir = tempfile::tempdir().expect("bench tempdir");
    for f in 0..200 {
        let mut body = String::new();
        for l in 0..50 {
            if l % 10 == 0 {
                body.push_str(&format!("fn handle_terminal_resize_{f}_{l}() {{}}\n"));
            } else {
                body.push_str(&format!("let value_{l} = compute({l}) + offset;\n"));
            }
        }
        std::fs::write(dir.path().join(format!("file_{f}.rs")), body).expect("bench file");
    }
    let root = dir.path().to_string_lossy().to_string();

    let mut group = c.benchmark_group("fs_grep");
    group.sample_size(30);
    group.bench_function("regex_200_files", |b| {
        b.iter(|| {
            let res = tauri::async_runtime::block_on(fs_grep(
                "handle_terminal_resize_\\d+".into(),
                black_box(root.clone()),
                None,
                Some(false),
                Some(2000),
                None,
            ))
            .expect("fs_grep");
            black_box(res.hits.len())
        });
    });
    group.finish();
}

criterion_group!(
    benches,
    bench_da_filter,
    bench_git_status_parse,
    bench_fs_grep
);
criterion_main!(benches);
