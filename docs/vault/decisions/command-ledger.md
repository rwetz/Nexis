---
type: decision
description: A per-workspace command ledger stored as an append-only NDJSON metadata log plus separate output blobs, redacted frontend-side, with private terminals excluded at the source.
---

# The command ledger is an NDJSON log plus content-addressed output blobs

**Date:** 2026-09
**Status:** active — design only. **No code exists yet.** This note is the gate the ROADMAP item names; implementation follows it.

## Context

Nexis injects OSC 133 shell integration, so every command already carries cwd, argv, exit code and timing, and an fswatch runs alongside it (`src-tauri/src/modules/fswatch.rs`). Today all of that feeds the exit-status gutter in `src/modules/terminal/lib/osc-handlers.ts` and is then discarded.

Eight items in ROADMAP's *"terminal-native features an IDE can't have"* are gated on keeping it: command provenance, success-filtered history, the failure/fix loop, build-time trends, the searchable output archive, "while you were away", the work journal, and "where was I?". Built ad hoc, that becomes five incompatible stores. Built once, it is the substrate the whole differentiating pool sits on.

The reason no IDE has this is structural: they treat the terminal as a dumb output pane, so the data is gone before it reaches them. Nexis owns the PTY, the watcher and the agent in one process.

## Decision

### 1. Two stores, split by size and by deletion cost

**Metadata** — one append-only NDJSON file per workspace, one JSON object per line: id, monotonic sequence, start/end timestamps, cwd, argv, exit code, duration, shell, workspace env, and an optional `outputId`.

**Output** — each block's captured output in its own file under a blobs directory, named by `outputId`, referenced from the metadata line. Never inline.

The split is not about performance, it is about **deletion**. See §5.

### 2. No new dependency — deliberately not SQLite

Storage is `~/.cache/nexis/command-ledger/<workspaceId>/`, matching the layout `src-tauri/src/modules/snapshots.rs` already uses for scrollback snapshots (`~/.cache/nexis/session-snapshots/`), including its `validate_id` charset restriction so a frontend-minted id can never traverse.

SQLite (`rusqlite`, bundled) was the obvious answer and is rejected. The Database panel shells out to the `sqlite3`/`psql`/`mysql` CLIs (`src/modules/database/databaseRunner.ts`) — there is **no in-process database in this repo today**, so this would be a genuinely new dependency with bundled C, a new `deny.toml` license entry, and a schema-migration story, in exchange for query shapes that a scan over small records handles fine.

Concretely: metadata records are ~200 bytes, the cap below bounds the file to a few tens of MB, and every gated feature except one is a filter or an aggregate over that — a full scan in Rust is milliseconds. The exception is the **searchable output archive**, which is a content search across blob files; that is the same problem ripgrep solves, at the same cost class, and it does not want a relational index.

**If FTS ever becomes the bottleneck, an index is an additive, rebuildable decision later.** The NDJSON log stays the source of truth precisely so a derived index can be deleted and rebuilt without data loss.

### 3. Redaction happens frontend-side, before IPC

`redactSensitive()` (`src/modules/ai/lib/redact.ts`) is TypeScript and has no Rust counterpart. Rather than port the pattern list — two copies of a security-critical regex set is how they drift — the ledger follows the precedent already set by the share server and the diagnostics bundle: **the frontend redacts, then calls the IPC command.**

`src/lib/pitfall-guards.test.ts` already asserts that outbound surfaces route through `redactSensitive` (the `http_share_*` entries). **The ledger write must be added to that guard in the same change that introduces it** — a command line is precisely where an API key ends up, and this store is durable by design.

Redaction applies to `argv` **and** to output blobs.

### 4. Private terminals never enter the ledger, and it is enforced at the source

`TerminalTab.private` already means "the AI agent cannot read this buffer" (`src/modules/tabs/lib/tabTypes.ts`), and `snapshotId` is already documented as never set on a private tab. The ledger holds the identical rule, checked where the OSC 133 event is handled rather than downstream — a filter applied at write time is a filter someone later moves.

Add a pitfall-guard assertion alongside the redaction one. A ledger that records private terminals is a silent privacy failure, and silent failures need tripwires, not review.

### 5. "Forget this" compacts; it never tombstones

This is the constraint that chose the storage shape.

- **Per entry** — from the block's gutter context menu. Rewrites the NDJSON file without that line (atomic write, then rename) and unlinks the blob.
- **Per workspace** — removes the whole `<workspaceId>/` directory.
- **Globally** — a preference to stop recording, routed through `writePref()` so it syncs across windows (CLAUDE.md pitfall #2).
- **"Forget the last N minutes"** — the escape hatch for a redaction miss. Redaction is a pattern list; it will miss something, and when it does the user needs a gesture that does not require finding every affected entry.

An append-only store with tombstones was rejected for exactly this: a tombstoned secret is still on disk until a compaction you cannot promise ran. If the contract says forget, the bytes go now. Rewriting a few tens of MB is sub-second and complete.

**Rename note:** on Windows the rewrite is a rename, so if a ledger ever lives inside a WSL workspace it needs pitfall #17's `wsl.exe --exec mv` fallback. Keeping the store in **host** app-data (like `snapshots.rs`, `autosave.rs`, `secrets.rs`) avoids that entirely — do not move it into the workspace tree.

### 6. Workspace identity is a normalized path, with git as the re-association key

Pitfall #23 is explicit that path strings are not stable identity, and `workspaceScopeKey()` in `src/modules/workspace/env.ts` does **not** help here — it returns only `local` or `wsl:<distro>`, which is an *environment* key, not a project key. Anything scoped with it is shared across every local project.

So:

- `workspaceId` = a hash of the workspace root path, normalized through `stripVerbatimPrefix`, slash-flipped, and case-folded on Windows.
- When the workspace is a git repo, the ledger header also records the **root commit SHA**.
- Opening a workspace whose path-hash has no ledger, where a git root commit matches an existing ledger under a different path, **offers to adopt it**. Never merges silently — a wrong guess grafts one project's history onto another.

This accepts that a non-git workspace moved to a new path starts fresh. That is the honest outcome; inventing a stronger identity would mean inventing a claim.

### 7. Retention has two independent caps

- **Metadata:** whichever binds first of an age limit (default 90 days) or a record count (default 50,000).
- **Output blobs:** a hard byte cap per workspace (default 256 MB), evicting oldest first.

Blobs dominate the footprint and are the least valuable per byte, so they are capped separately and evicted first — losing old output while keeping the timings and exit codes that build-time trends and the work journal need is the right trade. Eviction runs on workspace open, bounded so it cannot stall startup. Both caps are user-configurable; the cap is a real setting, not a constant, because "this grows forever by construction" is true and the right ceiling is a matter of taste and disk.

## Alternatives rejected

- **SQLite** — a new bundled-C dependency and a migration story, for query shapes a scan already answers. Revisit only if profiling says the scan is the bottleneck, and then as a rebuildable index rather than as the source of truth.
- **One NDJSON file with output inlined** — makes the log enormous, makes per-entry deletion a rewrite of everything, and makes the byte cap evict metadata and output together when only output is expensive.
- **Tombstones instead of compaction** — leaves forgotten secrets on disk. Incompatible with §5.
- **Storing the ledger inside the workspace** — puts it in git's way, and inside WSL it lands on the 9P share where every rename needs pitfall #17's fallback.
- **Reusing `workspaceScopeKey()` for identity** — it is environment-scoped, not project-scoped. Named here because it reads like the right helper and is not.
- **A Rust-side copy of `redactSensitive`** — two copies of a security-critical pattern list drift, and the frontend already redacts on every other outbound surface.

## Consequences

**Makes easy:** all eight gated features read one store with one shape. Success-filtered history and build-time trends are filters and aggregates over the metadata log. The output archive is a content search over blobs. Provenance joins fswatch events against the block that was open, and the honest "probably" it has to report is a property of that correlation, not of the storage.

**Makes hard:** cross-workspace queries (each workspace is its own directory — deliberate, since it also makes "forget this workspace" a directory removal). Full-text search over output is a scan, so a very large archive will be slower than an indexed store.

**A future change must respect:** private terminals never recorded; redaction before IPC with a tripwire; forget means compaction, not tombstones; the store stays in host app-data; identity is a normalized path plus an offered git re-association, never a bare path string.

**Known follow-up, unrelated to the ledger itself:** the HTTP client (`src/modules/webdev/HttpClientPanel.tsx`) scopes its saved requests with `currentWorkspaceScopeKey()` and therefore shares them across all local projects. It should use the §6 workspace id. Tracked as a fix, not a design change.

Related: [[e2e-harness]] (for the tripwire style), [[settings-sync]], [[pty]], and CLAUDE.md pitfalls #17, #23.
