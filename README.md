<div align="center">
  <img src="assets/nexis-logo.svg" width="128" height="128" alt="Nexis" />
  <h1>Nexis</h1>

  <p><strong>Open-source lightweight cross-platform AI-native terminal (ADE)</strong></p>

  <p>
    <a href="https://github.com/rwetz/Nexis/releases"><img src="https://img.shields.io/github/v/release/rwetz/Nexis" alt="latest release" /></a>
    <img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="license" />
    <img src="https://img.shields.io/badge/releases-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey" alt="release platforms" />
  </p>

  <p>
    <a href="https://wiki.nexisdev.org">Wiki</a> ·
    <a href="https://github.com/rwetz/Nexis/releases">Downloads</a> ·
    <a href="CHANGELOG.md">Changelog</a> ·
    <a href="ROADMAP.md">Roadmap</a> ·
    <a href="CONTRIBUTING.md">Contributing</a>
  </p>
</div>

---

Nexis is a lightweight, AI-first terminal and developer environment built on Tauri 2, Rust, and React 19. Native PTY backend, multi-tab terminals, a full code editor, file explorer, source control, and an AI panel that runs on your own API keys or entirely offline with a local model server. The current Windows build is roughly a 32 MiB native executable and a 10 MiB NSIS installer. API keys are stored in the OS keychain, and Nexis has zero telemetry.

This README is the short version. The **[wiki](https://wiki.nexisdev.org)** has the full story: [installation](https://wiki.nexisdev.org/installation/), [quick start](https://wiki.nexisdev.org/basics/quick-start/), [features](https://wiki.nexisdev.org/features/terminal/), [keybindings](https://wiki.nexisdev.org/configuration/keybindings/), [AI provider setup](https://wiki.nexisdev.org/configuration/ai-providers/), and [troubleshooting](https://wiki.nexisdev.org/troubleshooting/).

## Highlights

- **[Terminal](https://wiki.nexisdev.org/features/terminal/)**: xterm.js with WebGL rendering, unlimited tabs and split panes, native PTY (zsh, bash, pwsh, fish, cmd, WSL). Shell integration (cwd tracking, prompt markers, live tab titles), fuzzy shell-history search, private terminals the AI can't read, session recording, and read-only live sharing over LAN.
- **[Editor](https://wiki.nexisdev.org/features/editor/)**: CodeMirror 6 with highlighting for 20+ languages, AI inline autocomplete, per-hunk approval of AI-proposed edits, minimap, Vim mode, formatting on save, snippets, project-wide search and replace, and a fuzzy file picker.
- **[Language tooling](https://wiki.nexisdev.org/features/language-tooling/)**: real LSP servers (go-to-definition, hover, completion, diagnostics, rename, refactors), a DAP step-through debugger, and a problems panel.
- **[Source control](https://wiki.nexisdev.org/features/git/)**: stage, commit, and branch without leaving the app; commit graph, stash manager, merge-conflict resolver, worktrees, and AI-generated commit messages and PR descriptions.
- **[AI](https://wiki.nexisdev.org/features/ai-panel/)**: 18 provider backends, including OpenAI, Anthropic, Google, Groq, xAI, Cerebras, DeepSeek, Mistral, OpenRouter, Z.ai, Hugging Face, any OpenAI-compatible endpoint, and local servers through LM Studio, MLX, Ollama, vLLM, xLLM, or SGLang. Multi-agent workflows include tool approval, an agent task queue, codebase grep/glob/file search, voice input, prompt templates, and a context inspector that shows exactly what the model sees.
- **[ML Lab](https://wiki.nexisdev.org/ml-suite/)**: train small models on your own data, locally, with live charts, an inference playground, and run comparison. The **AI / ML** preset puts its reusable workbench tab in the titlebar alongside the required code, AI, monitoring, and benchmark tools. See [docs/ML_LAB_GUIDE.md](docs/ML_LAB_GUIDE.md).
- **Atlas**: a permanent companion window for every git repo on your machine — a status list (branch, ahead/behind, dirty counts, stashes, last commit) and an isometric map where repos are plots, files are buildings, and height is lines of code. It also makes project scale tangible with source-line totals, density, and clearly-labelled playful effort estimates. One scan, two views, one shared selection; open any repo as a workspace or terminal tab.
- **Benchmark**: a permanent companion window for measuring local models across inference backends. Drop in `.onnx` or `.gguf` files, run the model x backend matrix, and compare throughput, latency, peak memory and accuracy side by side — real inference through ONNX Runtime and llama.cpp, real training throughput through nexis-ml, and a simulated backend for everything else. Every result says which it was.
- **SVG Studio**: the Art pack promotes the vector workbench into the top titlebar, where it opens one reusable Nexis tab for source editing, direct canvas manipulation, generators, presets, optimization, preview, and export. The launcher appears for Art, Everything, and custom configurations with Art enabled.
- **[Themes](https://wiki.nexisdev.org/features/themes/)**: 22 built-in themes (17 Nexis palettes and five credited community palettes), custom `.nexis-theme` files with live preview, and background images with opacity and blur.
- **Workbench**: file explorer, web preview for local dev servers, and sidebar panels for background jobs, ports, SSH connections, tests, databases, build tasks, and releases.
- **Private by design**: API keys live in the OS keychain (never on disk), AI tools use an approval-gated, workspace-confined surface with secret and system-path defenses, outbound HTTP has SSRF and DNS-rebinding protection, and there is no telemetry. This is defense in depth, not an OS sandbox.

## Install

Download prebuilt releases from **[Releases](https://github.com/rwetz/Nexis/releases)**. Release automation publishes Windows x64 NSIS/MSI installers, Linux `.AppImage`, `.deb`, and `.rpm` bundles for amd64 and arm64, and macOS 13+ DMGs for Intel and Apple Silicon. macOS builds use an ad-hoc signature until the repository's Apple Developer signing and notarization secrets are configured, so Gatekeeper may require explicit approval in Privacy & Security.

Per-platform notes (SmartScreen, FUSE, Wayland, WSL) live in the wiki: [Linux](https://wiki.nexisdev.org/installation/linux/) · [Windows](https://wiki.nexisdev.org/installation/windows/) · [macOS](https://wiki.nexisdev.org/installation/macos/).

## Setting up AI

1. Open **Settings → AI**
2. Choose a provider and paste your API key. It is stored in the OS keychain via Rust's `keyring` crate, never on disk
3. For local/offline models, point Nexis at LM Studio, MLX, Ollama, vLLM, xLLM, SGLang, or another OpenAI-compatible server; no key is required unless your server expects one

Full provider list and configuration details: [AI providers](https://wiki.nexisdev.org/configuration/ai-providers/).

## Architecture

Nexis is one Tauri 2 desktop application with an explicit dependency direction:

- `src/platform/` owns typed IPC, workspace authorization and scope, filesystem/process access, persistence, windows, dialogs, notifications, and other native policy.
- `src/workbench/` owns contribution lifetimes, panels, commands, shortcuts, and shell composition without importing Tauri implementation details.
- `src/capabilities/` declares feature-owned panels, commands, and native contracts. Existing feature state remains under `src/modules/` where moving it would add churn without improving the boundary.
- `src/components/icon.tsx`, theme modules, and shared styles form the design seam.
- Rust keeps process construction, workspace confinement, PTY lifecycle, filesystem policy, and long-lived services behind thin Tauri commands.

Source-level architecture tests prevent platform dependencies from pointing upward, raw Tauri access from spreading, settings/workspace ownership from duplicating, and contribution IDs from colliding. See the [architecture boundary map](docs/vault/maps/architecture-boundaries.md), [redesign progress and verification record](docs/architecture/nexis-redesign-progress.md), and [Phase 0 inventory](docs/architecture/nexis-boundary-inventory.md).

## Building from source

Prerequisites: [Rust](https://rustup.rs) (stable), Node 22 LTS with [pnpm](https://pnpm.io) 11+, and the [Tauri platform prerequisites](https://tauri.app/start/prerequisites/).

```bash
pnpm install
pnpm tauri dev        # dev with hot reload
pnpm tauri build      # production build
```

Tests and checks: `pnpm test` (Vitest), `cargo test` in `src-tauri/`, `pnpm exec tsc --noEmit`, and `cargo clippy`. The Windows WebdriverIO suite requires Node 22 and an isolated release build created with `pnpm tauri build --config src-tauri/tauri.e2e.conf.json`; then run `pnpm test:e2e`.

## Docs

Everything contributor-facing lives in **[docs/](docs/)**.

- **[Wiki](https://wiki.nexisdev.org)**: user documentation: installation, features, configuration, FAQ, troubleshooting
- **[docs/architecture/](docs/architecture/)**: how the internals work, including the [architecture redesign record](docs/architecture/nexis-redesign-progress.md), [boundary inventory](docs/architecture/nexis-boundary-inventory.md), [two-process model](docs/architecture/two-process-model.md), [PTY and shell integration](docs/architecture/pty-shell-integration.md), [terminal renderer pool](docs/architecture/terminal-renderer-pool.md), [AI subsystem](docs/architecture/ai-subsystem.md), and [security model](docs/architecture/security-model.md)
- **[docs/vault/](docs/vault/Home.md)**: a linked navigational map of the codebase (module maps, subsystem notes, flows, decisions)
- **[CHANGELOG.md](CHANGELOG.md)**: the canonical record of everything that shipped
- **[ROADMAP.md](ROADMAP.md)**: what's planned, and the hard limits on what won't be built
- **[docs/ML_LAB_GUIDE.md](docs/ML_LAB_GUIDE.md)** / **[docs/ML_SUITE.md](docs/ML_SUITE.md)**: ML Lab usage guide and architecture
- **[SECURITY.md](SECURITY.md)**: security posture and reporting

### Reading the vault in Obsidian

`docs/vault/` is an [Obsidian](https://obsidian.md)-compatible knowledge base: plain markdown with
`[[wiki-links]]` and YAML frontmatter, no plugins required. GitHub renders those links as literal text, so
it's worth opening properly: in Obsidian choose **Open folder as vault** and point it at `docs/vault/`
inside your checkout (not the repo root). `Home.md` is the entry point, and the graph view shows how the
subsystems connect. Obsidian's per-user config goes in `docs/vault/.obsidian/`, which is gitignored.

Prefer not to install anything? Every note reads fine in any editor, and the prose guides in
[docs/architecture/](docs/architecture/) are plain markdown that renders correctly right here on GitHub.

## Credits: built on Terax

Nexis began as a personal fork of **[terax-ai](https://github.com/crynta/terax-ai)**, an open-source
AI-native terminal by **[@crynta](https://github.com/crynta)**. The foundations Nexis inherited from that
project (the PTY session architecture, the shell-integration approach, and the original AI tooling layer)
shaped everything that came after, and several later designs (the renderer-pool memory work among them)
were informed directly by upstream's own fixes.

Nexis has since taken its own direction, branding, and a substantially expanded feature set, but the
lineage is real and worth stating plainly. If you find Nexis useful, go give
[terax-ai](https://github.com/crynta/terax-ai) a look and a star.

Nexis is Apache-2.0, as is the upstream work it builds on.

## Stack

Tauri 2 · Rust · `portable-pty` · React 19 · TypeScript · xterm.js · CodeMirror 6 · Vercel AI SDK 7 · Tailwind v4 · shadcn/ui · Zustand

## Contributing

PRs and issues are welcome. Check [CONTRIBUTING.md](CONTRIBUTING.md) before opening anything non-trivial, and see the [good-first-issue](https://github.com/rwetz/Nexis/labels/good-first-issue) and [help-wanted](https://github.com/rwetz/Nexis/labels/help-wanted) labels for tracked tasks.

## License

Apache-2.0. See [LICENSE](LICENSE).
