---
type: map
description: Existing boundary ownership and the Phase 0 evidence for the incremental architecture redesign.
---

# Architecture boundaries

The [redesign plan](../../architecture/nexis-architecture-redesign-plan.md) defines the target dependency direction. The [Phase 0 inventory](../../architecture/nexis-boundary-inventory.md) records the verified 2026-09-14 baseline, site counts, current exceptions and next slices. Its JSONL companion is the per-file/per-site checklist; rerun the linked generator before relying on counts from a later revision.

## Where the boundaries currently live

- **Platform policy:** `platform/` owns the typed IPC transport, workspace environment and authorization, event lifetimes, storage queues, shared filesystem/process access, host keychain and callback-channel adapters, native dialogs/reveal operations, named-window creation, notifications, command-ledger persistence and system-resource sampling. Rust policy remains in `modules/{workspace,proc}.rs` and `modules/fs/`. See [[platform]], [[ipc-surface]] and [[settings-sync]].
- **Workbench:** `workbench/`, `app/App.tsx`, `app/useCapabilities.ts`, `app/useSidebarState.ts`, `modules/tabs/`, `modules/sidebar/`, `modules/shortcuts/`, `lib/packs.ts` and `lib/plugins/`. Web Tools, HTTP Client, Atlas, Benchmark, Source Control, Explorer, Debugger, Database, Ports, SSH, Share, and ML Lab use declarative panel registration; AI and terminal register their auxiliary commands. App still renders non-integration built-in utility panels through the legacy fallback. Atlas and Benchmark companion windows are declared by their capability and rendered by a generic shell. See [[workbench]].
- **Capabilities:** `modules/atlas`, `benchmark`, `terminal`, `editor`, `ai`, source-control/git-history and integrations. LSP's typed native protocol is rooted at `capabilities/lsp` while its session state remains in `modules/lsp`. The module directory is not itself an enforced boundary. See [[frontend-modules]] and [[rust-modules]].
- **Design:** `components/icon.tsx`, `components/icon-art.tsx`, `styles/`, `modules/theme/` and explorer icon retint. Persistence and native theme-window access need platform seams even though theme definitions are design-owned. See [[icon-and-motion-system]] and [[theming]].

## Extraction traps

- AI filesystem policy remains in `ai/lib/filesystem.ts`; the old `ai/lib/native.ts` bridge was deleted after its shared filesystem, process, git, ledger and system-resource consumers moved to their owning seams.
- `lib/plugins/types.ts` already owns panel/command contributions. Extend its policy rather than introducing a second registry. It currently depends on AI tool types; the generic contract and AI admission behavior have different owners.
- `workspaceScopeKey` identifies the local host or a WSL distro. It does not identify a repository root. Environment-dependent caches and root-dependent state require distinct keys.
- `modules/window/ToolWindowShell.tsx` is generic workbench composition despite its current platform-looking directory. Capability declarations provide its content and metadata.
- Atlas and Benchmark remain host-scoped. Benchmark jobs and listeners survive panel unmount; host export paths must not inherit the active WSL environment. See [[atlas]] and [[benchmark]].
- The global shortcut hook is `modules/shortcuts/lib/useGlobalShortcuts.ts`; built-in handlers and the command list still live in App. Panel keymaps such as Atlas's have separate scope today.

Phase 4 moved the named capability families onto typed platform contracts and contribution-owned integration panels in reviewable slices. Remaining direct native imports are confined to low-level adapters for PTY channels, Benchmark file-drop events, and quick-terminal window/global-shortcut construction. Non-integration utility panels still use the legacy App fallback and are future contribution cleanup, not duplicate platform implementations. See the [phase progress](../../architecture/nexis-redesign-progress.md) for verification. The root invariants remain authoritative.

Phase 5 enforcement is complete. `src/lib/architecture-boundaries.test.ts` ratchets frontend dependency direction, native access, raw invocation, and the single owners for preference and workspace policy. `src/capabilities/index.test.ts` validates the complete built-in manifest for namespaced, unique capability/panel/command IDs and collision-free persisted routes and companion windows. Existing pitfall suites remain the enforcement points for semantic icons, Rust subprocess construction, PTY/security rules, and contribution registration behavior. Add policy at the owning boundary rather than broadening an exception; every architecture failure names the violating source and intended seam.
