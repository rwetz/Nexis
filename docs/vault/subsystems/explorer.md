---
type: subsystem
description: Workspace file tree, fuzzy file search, create/rename/delete/move operations, file-manager reveal, and editor-opening callbacks.
---

# Explorer

Explorer is the workspace-scoped file tree and search surface. The capability workbench owns its legacy-compatible `explorer` panel and palette command; App supplies tab, terminal, preview, attachment, rename/delete, and imperative focus callbacks through the Explorer capability host.

## Key files

- `src/capabilities/editor/index.tsx` / `context.tsx` — declarative Explorer panel/command and the narrow workbench callback contract
- `src/modules/explorer/FileExplorer.tsx` — tree presentation, focus handle, file events, context actions, and search composition
- `src/modules/explorer/lib/useFileTree.ts` — expanded-node state, loading, create/rename/delete/move orchestration
- `src/modules/explorer/ExplorerSearch.tsx` — debounced `platform/filesystem.ts` search within the active workspace environment
- `src/modules/explorer/lib/contextActions.ts` — clipboard and host file-manager reveal through `platform/opener.ts`

## Invariants / gotchas

- Filesystem operations must go through the workspace-scoped filesystem service so WSL paths retain their caller-side Linux form and rename fallback remains available. See pitfall #17.
- `FileExplorerHandle` is part of the workbench contract: global focus/search shortcuts call it through App's stable ref even though panel rendering is capability-owned.
- Explorer unmounts when deactivated, matching the legacy conditional branch. Do not silently retain search/selection state without a product decision.
- File-tree art uses inline retinted SVG, not data URLs. See pitfall #18 and [[icon-and-motion-system]].

## Debugging entry points

- Wrong host/distro or failed WSL rename → `platform/filesystem.ts` and `modules/explorer/lib/useFileTree.ts`
- Search empty/error → `ExplorerSearch.tsx` and Rust `fs_search`
- Shortcut cannot focus tree → capability host `explorerRef` wiring in `app/App.tsx`

## Related

[[editor]] · [[platform]] · [[workbench]] · [[icon-and-motion-system]]
