---
type: decision
description: Atlas and Benchmark stop being separate desktop apps and become Nexis sidebar views; their repos are archived and their histories grafted in
---

# The Nexis apps become Nexis panels

**Date:** 2026-09
**Status:** active — Atlas and Benchmark absorbed in v1.27.0; the remaining family members are listed under "What is not absorbed" below

## Context

The Nexis family had grown to a set of separate Tauri desktop apps sharing a
name, a design language, and very little else:

| | |
|---|---|
| `Nexis` | the terminal / ADE |
| `nexis-atlas` | every git repo on the machine, as a list and as an isometric map (itself already a merge of `nexis-imagine` and `nexis-dev-dashboard`) |
| `nexis-benchmark` | benchmarking local ONNX/GGUF models across inference backends |
| `nexis-design` | the shared design package the others consume |
| `nexis-ml` / `nexis-ml-rs` | the training engine Nexis already spawns |

Each app was a separate binary, a separate install, a separate window, a
separate theme state, and a separate release. The costs compounded in a
specific way:

1. **The same work was done twice, differently.** Atlas located an installed
   Nexis by walking `LOCALAPPDATA`, `PROGRAMFILES` and `PATH` so it could spawn
   it at a repo. Benchmark shipped its own `find_nexis_ml` that did not know
   about the engine Nexis's own ML Lab downloads and manages, so the two could
   silently be measuring different binaries. Both apps hunted for a terminal
   emulator. All three of those problems disappear rather than get fixed.
2. **They could not share a selection.** "Show me this repo" needed a
   `nexis-atlas://` URL scheme, a deep-link plugin, a single-instance plugin,
   and a validated URL parser — roughly 400 lines of Rust and TS whose entire
   job was to move one path between two processes on the same machine.
3. **The design layer had already proved the point.** `nexis-design` exists
   because four apps carrying a copied `_design/` blueprint drifted into four
   different `globals.css` and four different `button.tsx`. Extracting a
   package fixed the styling drift and did nothing about the other four kinds.

The two constraints that had historically ruled this out were both already
gone or explicitly waived: the binary-size budget became a loose regression
tripwire in 2026-09, and "Nexis is a terminal, not an IDE" stopped being true
when it grew a debugger, an LSP client and a database panel.

## Decision

1. **Absorb, don't launch.** Atlas and Benchmark become sidebar views inside
   Nexis — one binary, one window, one theme, one workspace. The alternative
   considered and rejected was a "hub": Nexis detects installed siblings and
   deep-links to them. That keeps every cost above and adds a launcher.

2. **File them by tool kind, not by provenance.** Atlas lands in the
   `dev-tools` pack, Benchmark in `ml-lab` (which already owns the engine
   Benchmark measures). A pack for "apps that used to be apps" would encode a
   fact about this repository's history into the surface a user picks features
   from.

3. **Absorbed code adopts the host's invariants, not the other way round.**
   Every vendored file was brought to Nexis's rules rather than exempted from
   them — `proc::command` for subprocesses, `modules::heavy` for anything that
   touches the disk, poison-recovering mutexes, `@/components/icon` instead of
   a direct icon-vendor import, CSS motion tokens instead of an animation
   library. The tripwire suites made this non-optional, which is the argument
   for having them.

4. **Delete the second implementation every time.** Where an absorbed app
   carried its own version of something Nexis has — `formatBytes`, a byte
   formatter; `write_text_file`, a file write; a browser-mode simulator behind
   `IS_TAURI`; a theme provider — the absorbed one goes. Carrying both is the
   drift this whole exercise exists to end.

5. **Graft the history, then archive the repo.** Each repository's history is
   merged in (via `git subtree`, so `git log --follow` and `git blame` reach
   it), then the standalone repo is archived with a pointer. This is the same
   play used when `nexis-dev-dashboard` was merged into Atlas. Dual-shipping
   was rejected for the obvious reason: two copies of one codebase is the
   `_design` blueprint again.

## Consequences

**Accepted costs.**

- **The binary carries a prebuilt ONNX Runtime.** This is the significant one
  and it has its own note — see [[bundling-onnx-runtime]]. The release
  tripwire moved 40 MB → 150 MB to accommodate it.
- **libgit2 is now linked in.** Atlas's scan uses `git2` while the source
  control panel drives the `git` CLI. That is a deliberate split, not an
  oversight: a panel that *writes* must respect the user's config, credential
  helpers and hooks, which means the CLI; a read-only sweep over every repo on
  the machine wants in-process reads and no process-per-repo.
- **`rayon` is in the tree**, having previously been argued *out* of the
  `sysinfo` feature set on size grounds. Atlas's parallel scan is the use that
  justifies it.
- **Deep links are gone.** `nexis-atlas://focus?path=…` has nothing to link
  to. If Nexis registers a scheme later, this is where the grammar goes.
- **Atlas reports the host machine, always.** It is a machine-wide inventory,
  so it does not follow the active workspace into a WSL distro the way `fs_*`
  and `git_*` do. Pitfall #20's requirement is met by saying so in the panel's
  status line rather than by re-rooting the scan. Scanning inside a distro is a
  real feature and is tracked in ROADMAP.
- **Window-scoped keyboard maps became subtree-scoped.** Both apps bound bare
  letters (`r`, `t`, `v`, `j`/`k`) to `window`. Next to a terminal that is not
  available, so the bindings only fire while focus is inside the panel.

**What is not absorbed, and why.**

- `nexis-design` stays a dependency of nothing inside Nexis — Nexis has its own
  design layer, and the package exists for apps that are not Nexis.
- `nexis-ml` / `nexis-ml-rs` stay external processes. That is the position
  `docs/ML_SUITE.md` argues and it still holds: a *training* engine brings a
  per-backend build matrix and a GPU-driver support surface. Inference through
  ONNX Runtime is a fixed-size dependency with none of that shape, which is
  precisely why it was the one that could come in.
- `nexis-wiki` and `nexis-website` are sites, not panels.

## See also

- [[bundling-onnx-runtime]] — the size decision this one forced
- [[expansion-packs]] — why the panels are filed the way they are
- `docs/vault/subsystems/atlas.md`, `docs/vault/subsystems/benchmark.md`
