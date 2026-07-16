# Zed inspiration notes — docs & Rust optimization

Research date: 2026-07-15. Two halves: (1) what [zed.dev/docs](https://zed.dev/docs/) does well and
what nexis-wiki should steal, (2) Rust performance lessons from
[zed-industries/zed](https://github.com/zed-industries/zed) that actually apply to a Tauri app.
Multiplayer/collab is deliberately out of scope (see ROADMAP hard limits — and Zed's collab stack is
the part we care about least anyway).

Actionable items are mirrored in `ROADMAP.md` (hardening backlog); this file holds the detail and
the "why".

---

## Part 1 — Zed's docs, applied to nexis-wiki

Zed's docs are an mdBook living in the main repo (`docs/src/SUMMARY.md`). nexis-wiki is already on a
stronger stack for our purposes (Astro Starlight, Pagefind search, per-OS `starlight-kbd` — Zed's
keybinding display is the same idea, so that's parity already). What's worth stealing is the
**information architecture**, not the tooling.

### Zed's sidebar shape (July 2026)

Welcome → Working with Code → Collaboration → Remote Development → AI → Account & Billing →
Zed Business → Privacy & Security → Platform Support → Customization → Language Support →
Extensions → **Coming From…** → **Reference** → **Developing Zed**

### What they do well

1. **Task-oriented top level.** "Working with Code" groups editing, navigation, running/testing —
   organized around what the user is doing, not around internal feature names. Our current
   "Features" bucket (terminal, editor, ai-panel, git…) is organized by module; fine for now, but as
   pages grow, group by task.

2. **"Coming From…" migration guides.** Zed has dedicated pages for VS Code, IntelliJ, PyCharm,
   WebStorm, RustRover users. This is the single highest-leverage docs idea for us: a new user's
   first question is "how does this compare to what I use today". For a terminal, the equivalents
   are **Warp, iTerm2, Windows Terminal, kitty/alacritty, and the VS Code integrated terminal** —
   each page mapping familiar workflows/keybindings to the Nexis way, and being honest about what we
   don't do (ties into ROADMAP "hard limits").

3. **Exhaustive generated Reference section.** Zed publishes an "All Settings" page, a full actions
   list, and CLI docs. Users google individual setting names and land there. We should generate a
   settings reference from the settings store (single source of truth — the same schema
   `src/modules/settings/store.ts` already encodes) rather than hand-writing
   `configuration/settings.md` and letting it rot. Same for the keybindings table and any CLI flags.

4. **Privacy & Security as a first-class section**, not a legal footnote: worktree trust, exactly
   what telemetry exists, what data AI features send where. Nexis's story ("no telemetry, BYOK,
   local models, path guards, SSRF protection, tool approval") is a *differentiator* and currently
   lives only in ROADMAP/README. Give it a top-level wiki section — it's the page security-conscious
   users look for before installing an AI-anything.

5. **Per-platform pages including troubleshooting.** Zed has a real "Linux" page (install matrix,
   GPU/driver issues, common failures). Our installation pages exist; the troubleshooting section
   should get per-platform pages seeded from the pitfalls we already document internally — e.g. a
   public "blank terminal on Windows" page walking the same checklist as CLAUDE.md pitfall #1, in
   user language.

6. **"Developing Zed" lives in the user docs.** Build-from-source, debugging, profiling, release
   process — contributor docs in the same searchable site. We have `docs/vault/` (internal map) and
   CONTRIBUTING.md; a "Developing Nexis" wiki section can be a thin public layer that links to the
   repo rather than duplicating it. (Keep the vault as the source; the wiki page is the front door.)

7. **Docs live next to the code.** Zed's docs are in the main repo, so a feature PR can update docs
   in the same diff. nexis-wiki is a separate repo — that's fine for site tooling, but it means docs
   drift is invisible to the pre-push checklist. Mitigation: add a "wiki page touched?" line to the
   PR/release routine the same way CHANGELOG is enforced, or move content into the main repo later
   and have the wiki build pull it in.

### Concrete sidebar additions for nexis-wiki

- `Coming from…` — Warp / iTerm2 / Windows Terminal / kitty & alacritty / VS Code terminal
- `Privacy & Security` — telemetry (none), AI data flow per provider, tool approval, path guards
- `Reference` — All settings (generated), Keybindings (generated), CLI
- `Troubleshooting` — per-platform pages (Windows: blank terminal checklist; Linux: Wayland/GPU;
  macOS: keychain/permissions)
- `Developing Nexis` — build from source, architecture overview, how to profile

---

## Part 2 — Rust optimization lessons from Zed

Context for honest comparison: Zed optimizes for **speed at any binary size** (170+ crates,
GPU-native GPUI renderer, 120 FPS, <500 ms cold start). Nexis optimizes for **speed within a
<10 MB budget** on a Tauri webview. GPUI and the collab layer don't transfer. What transfers is
below, roughly in impact-per-effort order.

### 2.1 Benchmark culture: Criterion before optimizing ✅ cheap, do first

Zed's rope optimization work ([Rope Optimizations, Part 1](https://zed.dev/blog/zed-decoded-rope-optimizations-part-1))
is driven by Criterion microbenchmarks — they measured a 57 ns loop become 1 ns with a bitmask
(57× in isolation, ~70% on the real path) *before* believing it. Nexis has **zero `benches/`**.
The ROADMAP already says "profile hot paths" for the TS→Rust migration; benchmarks are the
prerequisite. Candidates, in order:

- PTY reader→flusher pipeline throughput (`session.rs` pending buffer) — bytes/sec under a
  synthetic flood; guards the `MAX_PENDING` backpressure tradeoff (pitfall #7)
- `fs_grep` / `fs_search` over a large synthetic tree
- git stdout parsing (`process.rs` lossy conversion + line splitting) on large logs/diffs
- shell-integration OSC/marker scanning if any of it is Rust-side

### 2.2 Cargo profiles: keep the shipping profile, add iteration profiles ✅ cheap

Zed's workspace profiles (from their root `Cargo.toml`):

```toml
[profile.release]
debug = "limited"     # keep symbols — they profile release builds
lto = "thin"
codegen-units = 1

[profile.release-fast]      # for iterating on perf work
inherits = "release"
debug = "full"
lto = false
codegen-units = 16

[profile.dbg]               # full-debug variant of dev
inherits = "dev"
debug = "full"
```

Nexis's release profile (`fat` LTO, `opt-level = "s"`, `panic = "abort"`, `strip = true`,
`codegen-units = 1`) is **more** aggressive than Zed's for size — correct for the 10 MB budget,
don't change it. The gap is iteration: fat-LTO + cgu=1 makes every release build glacial, and
`strip = true` makes profiling impossible. Add:

```toml
[profile.profiling]        # perf/flamegraph against optimized code
inherits = "release"
debug = "limited"
strip = false
lto = "thin"

[profile.release-fast]     # "is it fast enough?" loop without the LTO wait
inherits = "release"
lto = false
codegen-units = 16
```

Neither ships; both make the 2.1 benchmarks and any flamegraph work actually usable.

### 2.3 Workspace clippy lints Zed denies that we don't ✅ cheap

From Zed's `[workspace.lints.clippy]`: `dbg_macro = "deny"`, `todo = "deny"`,
`redundant_clone = "deny"`, `declare_interior_mutable_const = "deny"`, `disallowed_methods = "deny"`.

Nexis already has the `disallowed_methods` pattern (the `proc::command` ConPTY gate — parity with
Zed, arguably stronger since ours is backed by a tripwire test too). Worth adopting via `[lints]`
in `src-tauri/Cargo.toml`:

- `redundant_clone` — the classic Rust perf paper-cut, catches real allocations in hot paths
- `dbg_macro` / `todo` — hygiene; nothing half-finished reaches CI

Note: `redundant_clone` is technically a nursery lint with occasional false positives; if it's
noisy, `warn` + CI `-D warnings` gets the same effect with an escape hatch per-site.

### 2.4 The snapshot pattern: `Arc` + copy-on-write beats locking

The deepest transferable idea ([Rope & SumTree](https://zed.dev/blog/zed-decoded-rope-sumtree)):
when Zed needs background work on shared state (re-parsing after an edit), it doesn't lock — it
hands the background thread a **cheap immutable snapshot** (bump an `Arc` refcount, copy-on-write
underneath) and lets the main path keep mutating. No contention, no stalls.

Nexis analogs where we currently either lock shared state or recompute from scratch:

- git status / branch info recomputation — snapshot the last-known state, diff in background,
  swap atomically
- file-tree diffing for the explorer (already a ROADMAP migration candidate)
- future persistent-session scrollback (ROADMAP "Persistent terminal sessions"): scrollback as an
  immutable chunk chain makes save/restore and the live view read the same structure without a lock

Rule of thumb from Zed: if a background task needs a `Mutex` on the hot path, the data structure is
wrong — make reads snapshot-cheap instead. (Our poisoned-mutex pitfalls #8/#9 are downstream
symptoms of lock-shaped sharing; snapshots sidestep the whole class where they fit.)

### 2.5 Chunk metadata + branchless bit tricks (or just use `memchr`/`bytecount`)

Zed's rope chunks are 128-byte `ArrayString`s carrying precomputed `u128` bitmasks (`newlines`,
`chars`, `chars_utf16`, `tabs`) — queries become `count_ones()` / `leading_zeros()` (single CPU
instructions) instead of byte loops. Two lessons at our scale:

1. **Precompute per-chunk summaries once at write time; query the summary, not the bytes.**
   Applies to any future Rust-side structure that repeatedly answers "how many newlines/where is
   the Nth X" — scrollback indexing, diff hunk mapping, large-file line offset tables.
2. **Don't hand-roll the SIMD** — `grep-searcher` (already a dependency) sits on `memchr`, which
   does this class of trick internally. Before writing any byte-scanning loop in new Rust code,
   reach for `memchr`/`bytecount`. The win Zed measured (57×) is the ceiling for replacing a naive
   scan.

### 2.6 SumTree as the reference design for the TS→Rust migration

Zed's SumTree (a copy-on-write B+-tree where every node carries an aggregated summary; O(log n)
seek along *any* summary dimension) is used well beyond text: file lists, diagnostics, git blame,
fold state. If/when the ROADMAP "Selective TS → Rust migration" targets **diff rendering** or
**file-tree diffing**, this is the data structure to study first — one tree answers
"offset → line/col", "line → hunk", "path → subtree size" without separate indexes. Don't build it
speculatively; build it when a benchmark from 2.1 says the naive version is the bottleneck. (The
`sum_tree` crate in Zed's repo is Apache-2.0/GPL — read it for design, we'd write our own minimal
version.)

### 2.7 What doesn't transfer (recording the decision so it isn't re-litigated)

- **GPUI / GPU-native rendering** — we're a Tauri webview by design (size budget, web ecosystem).
  Our equivalent lever is already pulled: xterm.js WebGL renderer, throttled AI streaming renders,
  lazy panels. The webview ceiling is real but acceptable; a renderer rewrite is out of scope.
- **170-crate workspace split** — good for their compile times at 700k+ LOC; our single crate is
  fine at current size. Revisit only if `src-tauri` build times hurt.
- **Rope text buffer** — CodeMirror owns the editor buffer on our stack; reimplementing it in Rust
  is a VS-Code-replacement move (ROADMAP hard limit).
- **Collab/multiplayer infrastructure** — explicitly out of scope per this note's brief.

---

## Sources

- [Zed docs](https://zed.dev/docs/) · [docs SUMMARY.md](https://github.com/zed-industries/zed/blob/main/docs/src/SUMMARY.md) (sidebar structure)
- [zed-industries/zed](https://github.com/zed-industries/zed) — root `Cargo.toml` (profiles, workspace lints)
- [Zed Decoded: Rope & SumTree](https://zed.dev/blog/zed-decoded-rope-sumtree)
- [Zed Decoded: Rope Optimizations, Part 1](https://zed.dev/blog/zed-decoded-rope-optimizations-part-1)
