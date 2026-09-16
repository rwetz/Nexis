---
type: map
description: Existing boundary ownership and the Phase 0 evidence for the incremental architecture redesign.
---

# Architecture boundaries

The [redesign plan](../../architecture/nexis-architecture-redesign-plan.md) defines the target dependency direction. The [Phase 0 inventory](../../architecture/nexis-boundary-inventory.md) records the verified 2026-09-14 baseline, site counts, current exceptions and next slices. Its JSONL companion is the per-file/per-site checklist; rerun the linked generator before relying on counts from a later revision.

## Where the boundaries currently live

- **Platform policy:** `platform/` owns the typed IPC transport, workspace environment and authorization, event lifetimes, storage queues, shared filesystem/process access, host keychain and callback-channel adapters, native dialogs/reveal operations, named-window creation, notifications, command-ledger persistence and system-resource sampling. Rust policy remains in `modules/{workspace,proc}.rs` and `modules/fs/`. See [[platform]], [[ipc-surface]] and [[settings-sync]].
- **Workbench:** `workbench/`, `app/App.tsx`, `app/useCapabilities.ts`, `app/useSidebarState.ts`, `modules/tabs/`, `modules/sidebar/`, `modules/shortcuts/`, `lib/packs.ts` and `lib/plugins/`. Web Tools, Atlas, Benchmark, Source Control, Explorer, and the AI/terminal auxiliary commands use declarative registration; App still renders remaining built-in sidebar panels with a central conditional chain. Atlas and Benchmark companion windows are declared by their capability and rendered by a generic shell. See [[workbench]].
- **Capabilities:** `modules/atlas`, `benchmark`, `terminal`, `editor`, `ai`, source-control/git-history and integrations. The module directory is not itself an enforced boundary. See [[frontend-modules]] and [[rust-modules]].
- **Design:** `components/icon.tsx`, `components/icon-art.tsx`, `styles/`, `modules/theme/` and explorer icon retint. Persistence and native theme-window access need platform seams even though theme definitions are design-owned. See [[icon-and-motion-system]] and [[theming]].

## Extraction traps

- AI filesystem policy remains in `ai/lib/filesystem.ts`; the old `ai/lib/native.ts` bridge was deleted after its shared filesystem, process, git, ledger and system-resource consumers moved to their owning seams.
- `lib/plugins/types.ts` already owns panel/command contributions. Extend its policy rather than introducing a second registry. It currently depends on AI tool types; the generic contract and AI admission behavior have different owners.
- `workspaceScopeKey` identifies the local host or a WSL distro. It does not identify a repository root. Environment-dependent caches and root-dependent state require distinct keys.
- `modules/window/ToolWindowShell.tsx` is generic workbench composition despite its current platform-looking directory. Capability declarations provide its content and metadata.
- Atlas and Benchmark remain host-scoped. Benchmark jobs and listeners survive panel unmount; host export paths must not inherit the active WSL environment. See [[atlas]] and [[benchmark]].
- The global shortcut hook is `modules/shortcuts/lib/useGlobalShortcuts.ts`; built-in handlers and the command list still live in App. Panel keymaps such as Atlas's have separate scope today.

Web Tools, Atlas, Benchmark, Source Control, Explorer, and the AI/terminal auxiliary commands now use the contribution workbench. Phase 3 moved the shared platform policies and deleted the workspace and AI-native parallel implementations; Phase 4 is moving capability IPC and shell ownership in reviewable slices. Integration raw IPC remains on the migration queue. See the [phase progress](../../architecture/nexis-redesign-progress.md) for verification and remaining legacy paths. The root invariants remain authoritative.
