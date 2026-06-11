# Contributing to Nexis

Nexis is a personal project I maintain in my spare time. Contributions are genuinely welcome, but I want to be upfront about how this works so nobody wastes their time.

## How I run this

One maintainer (me, [@rwetz](https://github.com/rwetz)), limited review time. PRs can sit for a bit. Not everything gets merged — code quality matters, but so does fit. Before doing anything significant, check [ROADMAP.md](ROADMAP.md) to understand where this is going.

A "no" isn't personal.

## Getting started

```bash
pnpm install
pnpm tauri dev
```

You'll need Rust (stable), Node 22+, pnpm 11+, and the [Tauri platform dependencies](https://tauri.app/start/prerequisites/).

## What to discuss first

For anything beyond a small, obvious fix — open an issue before writing code. This covers:

- New features or AI providers
- UI/UX changes
- Refactors touching multiple files
- Architectural changes

A quick conversation upfront is better than a big PR that doesn't fit where things are going. Small stuff (typos, narrow bug fixes, docs tweaks) — just open a PR, no issue needed.

## Keeping PRs clean

**One PR, one thing.** If you're fixing a bug in the terminal module, don't also clean up unrelated files, reformat code you didn't need to touch, or bundle in a separate improvement. Split it out. Mixed-concern PRs are harder to review and slower to merge.

## What I'm looking for

Every PR gets checked against:

- `pnpm exec tsc --noEmit` passes
- `cargo clippy` and `cargo fmt` clean
- `pnpm test` and `cargo test` pass
- No obvious performance regressions in hot paths (terminal renderer, PTY stream, AI streaming, file explorer)
- No heavy new dependencies without a good reason
- Works on macOS, Linux, Windows, and WSL
- Security-sensitive changes (AI tools, FS access, IPC, network) get extra scrutiny

## What this project isn't trying to be

- A VS Code replacement. LSP, DAP debugging, and refactoring exist, but the goal stays a focused terminal-first tool — not a feature-for-feature IDE clone.
- A web browser. The preview pane is for local dev servers only.
- An extension platform. Not building a marketplace.
- A good "first open source contribution" project — beginners are welcome but expect real feedback.

## Branch and commit conventions

Branch off `main`. Prefix your branch:

| Prefix | Use |
|---|---|
| `feat/` | New feature |
| `fix/` | Bug fix |
| `chore/` | Tooling, deps, refactor |
| `docs/` | Documentation |
| `perf/` | Performance |
| `security/` | Security fix |

PR titles should follow [Conventional Commits](https://www.conventionalcommits.org/) — they become the squash commit message:

```
feat(terminal): add persistent session restore
fix(explorer): rename input disappears on blur
chore(deps): update tauri to 2.11
```

Fill out the PR description. What changed, why, how you tested it. UI changes need screenshots or a short recording.

## Code style

- Follow what's already there. Read nearby files before writing new ones.
- TypeScript strict mode is on. No `any` without a real reason.
- Rust: `cargo fmt` before committing, `clippy` must be clean.
- Comments explain *why*, not *what*.
- American English in user-facing strings.

## Project layout

```
src-tauri/src/modules/
  pty/          PTY sessions, shell init scripts, DA filter
  fs/           File system access
  git/          Source control operations
  net/          Outbound HTTP proxy (AI requests) with SSRF guard
  lsp/          Language-server proxy (sessions, JSON-RPC framing)
  dap/          Debug-adapter proxy
  http_share    LAN share server (HTTP + SSE + WebSocket)
  workspace/    WSL support, workspace environment

src/modules/
  terminal/     xterm.js, OSC handlers, renderer pool
  editor/       CodeMirror 6, AI autocomplete, themes
  explorer/     File tree, icons, search
  tabs/         Tab model, workspace cwd tracking
  ai/           Agents, sessions, tools, providers, UI
  lsp/          LSP client, editor extensions, workspace-edit applier
  debugger/     DAP UI — breakpoints, stepping, variables
  share/        LAN share panel and live streaming
  git-history/  Commit graph and history viewer
  source-control/ Staging, commits, branches
  preview/      Web, image, and Markdown preview
  settings/     Preferences and settings window
  shortcuts/    Global keymap
```

## Security issues

Don't open a public issue — see [SECURITY.md](SECURITY.md).

## License

Contributions go in under [Apache-2.0](LICENSE). No CLA.
