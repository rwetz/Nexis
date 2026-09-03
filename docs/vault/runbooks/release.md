---
type: runbook
description: Cutting a tagged release — the four version files that must move together, the CHANGELOG rename, and what the tag push actually triggers.
---

# Cutting a release

A release is one commit that bumps the version and renames the CHANGELOG's `[Unreleased]` heading, plus an annotated tag. Pushing the tag is what builds and publishes — nothing else does.

## Before anything else

Run the **pre-push checklist in CLAUDE.md** in full. A release tag that fails CI has already published a broken build by the time you find out, because `.github/workflows/release.yml` fires on the tag, not on a green check.

## 1. Version — four files, one number

The version lives in four places and they must never disagree:

- `package.json` → `"version"`
- `src-tauri/Cargo.toml` → `[package] version`
- `src-tauri/Cargo.lock` → the `name = "nexis"` package entry (**easy to miss**; `cargo build` would rewrite it, but a release commit that leaves it stale makes the lockfile dirty in CI)
- `src-tauri/tauri.conf.json` → `"version"` (this is the one that reaches the installer and the About dialog)

SemVer, pre-1.0 conventions per the CHANGELOG's own header. A release carrying any user-facing feature or behaviour change is a minor bump.

## 2. CHANGELOG — rename, don't move

Insert the new heading **below** the `[Unreleased]` heading and leave `[Unreleased]` in place and empty:

```markdown
## [Unreleased]

## [1.24.0] — 2026-08-18
```

Everything that was under `[Unreleased]` now belongs to the new version by position. There are no link definitions at the bottom of the file to maintain.

## 3. Sweep for stale `[Unreleased]` pointers

This is the step that gets skipped. `ROADMAP.md` and the vault both cite shipped work as "see CHANGELOG `[Unreleased]`" — those citations silently start pointing at the *next* release's empty section the moment you do step 2. Grep and repoint them at the version that actually carried the work:

```sh
grep -rn 'CHANGELOG `\[Unreleased\]`\|`\[Unreleased\]` CHANGELOG' ROADMAP.md docs/
```

Also prune `ROADMAP.md` of anything this release landed — it tracks only what's planned, never what shipped (see [[Home]] and the record-keeping rule in CLAUDE.md).

## 4. Commit and tag

```sh
git commit -m "release: v1.24.0 — <short theme>"
git tag -a v1.24.0 -m "v1.24.0 — <short theme>"   # annotated, `v` prefix
git push origin main --follow-tags
```

The subject line's theme is reused as the tag subject and reads as the release title. The commit body is a few prose paragraphs describing the release as a whole — not a changelog copy, which the release notes already link to.

## What the tag triggers

`.github/workflows/release.yml` runs on `push: tags: v*` — it builds the Windows and Linux (amd64 + arm64) artifacts — there is **no macOS job**, so no release carries a macOS build — runs the loose **40 MB binary-size tripwire** (a regression guard, not a budget — see ROADMAP's non-negotiables), and creates the GitHub release. Concurrency is one release build at a time, and it does **not** cancel in progress, so a mistaken tag can't be fixed by racing a second one — delete the tag remote-side and re-push.
