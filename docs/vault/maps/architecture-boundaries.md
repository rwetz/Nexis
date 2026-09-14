---
type: map
description: Existing boundary ownership and the Phase 0 evidence for the incremental architecture redesign.
---

# Architecture boundaries

The [redesign plan](../../architecture/nexis-architecture-redesign-plan.md) defines the target dependency direction. The [Phase 0 inventory](../../architecture/nexis-boundary-inventory.md) records the verified 2026-09-14 baseline, site counts, current exceptions and next slices. Its JSONL companion is the per-file/per-site checklist; rerun the linked generator before relying on counts from a later revision.

## Where the boundaries currently live

- **Platform policy:** `modules/workspace/env.ts`, `modules/settings/store.ts`, `lib/path.ts`, and Rust `modules/{workspace,proc}.rs` / `modules/fs/`. IPC transport is still distributed through capability bridges, especially `modules/ai/lib/native.ts`. See [[ipc-surface]] and [[settings-sync]].
- **Workbench:** `app/App.tsx`, `app/useSidebarState.ts`, `modules/tabs/`, `modules/sidebar/`, `modules/shortcuts/`, `lib/packs.ts` and `lib/plugins/`. App still renders built-in sidebar panels with a central conditional chain; contributed panels use `PluginPanelSlot` and the registry.
- **Capabilities:** `modules/atlas`, `benchmark`, `terminal`, `editor`, `ai`, source-control/git-history and integrations. The module directory is not itself an enforced boundary. See [[frontend-modules]] and [[rust-modules]].
- **Design:** `components/icon.tsx`, `components/icon-art.tsx`, `styles/`, `modules/theme/` and explorer icon retint. Persistence and native theme-window access need platform seams even though theme definitions are design-owned. See [[icon-and-motion-system]] and [[theming]].

## Extraction traps

- `ai/lib/native.ts` serves many non-AI consumers, but some helpers embed AI policy (`readDir` hides dotfiles). Moving the whole object would misclassify that policy.
- `lib/plugins/types.ts` already owns panel/command contributions. Extend its policy rather than introducing a second registry. It currently depends on AI tool types; the generic contract and AI admission behavior have different owners.
- `workspaceScopeKey` identifies the local host or a WSL distro. It does not identify a repository root. Environment-dependent caches and root-dependent state require distinct keys.
- `modules/window/ToolWindowShell.tsx` imports Atlas and Benchmark. It is workbench composition despite its current platform-looking directory.
- Atlas and Benchmark remain host-scoped. Benchmark jobs and listeners survive panel unmount; host export paths must not inherit the active WSL environment. See [[atlas]] and [[benchmark]].
- The global shortcut hook is `modules/shortcuts/lib/useGlobalShortcuts.ts`; built-in handlers and the command list still live in App. Panel keymaps such as Atlas's have separate scope today.

The inventory proposes Web Tools as the first low-risk contributed panel, followed by Atlas. No production consumers have migrated in Phase 0. The root invariants remain authoritative; this note maps their locations rather than restating them.
