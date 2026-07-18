---
type: subsystem
description: Code editor — CodeMirror 6 panes (editor, git diff, AI diff), shared extensions, autocomplete ghost text, zoom interplay.
---

# Editor

CodeMirror 6 via `@uiw/react-codemirror`. Three pane types render CM instances — `src/modules/editor/EditorPane.tsx` (the main editor), `GitDiffPane.tsx`, and `AiDiffPane.tsx` — all composing the same `buildSharedExtensions()` from `src/modules/editor/lib/extensions.ts` (theme, lint gutter, region folding, search). LSP, debugger breakpoints, and AI inline completion attach as extensions on top.

## Key files

- `src/modules/editor/lib/extensions.ts` — shared compartments + `buildSharedExtensions()`; the `.cm-scroller` theme here is where editor font/line-height live
- `src/modules/editor/EditorPane.tsx` — main pane; wires LSP (`modules/lsp/lspExtension.ts`), breakpoints, vim, snippets, inline completion
- `src/modules/editor/lib/autocomplete/inlineExtension.ts` — AI ghost-text completion (StateField + widget decoration, LRU cache, debounced driver)
- `src/modules/editor/lib/useDocument.ts` — file load/save/dirty state; also owns crash recovery: debounced dirty-buffer autosaves via `autosave-bridge.ts` → `modules/autosave.rs` (path-keyed by pinned FNV-1a hash, collision-guarded), offered back as a Restore/Discard banner when an autosave differs from disk on load
- `src/modules/editor/Minimap.tsx` — separate DOM sibling, polls the view every 200 ms; not a CM extension
- `src/lib/useZoom.ts` + `.zoom-content` / `.zoom-exempt` in `src/styles/globals.css` — app zoom (CSS `zoom`), which the editor must be exempt from

## Invariants / gotchas

- **CM must never sit under an effective CSS `zoom` ≠ 1** — clicks map to the wrong line on WebKitGTK. `.zoom-content .cm-editor` carries an inverse zoom, and app zoom reaches the code via `fontSize: calc(13px * var(--app-zoom, 1))` in the shared theme. See CLAUDE.md pitfall #15 (tripwired in `src/lib/pitfall-guards.test.ts`).
- The `extensions` array passed to `<CodeMirror>` must keep a stable identity (memoized once, callbacks via refs) — a new identity makes `@uiw/react-codemirror` rebuild state and wipes the language compartment (comment at `EditorPane.tsx:167`).
- **Large-file mode** (2026-07): files over `LARGE_FILE_BYTES` (2 MiB, `EditorPane.tsx`) open with LSP/lint/folding/minimap/AI-completion off and a banner offering "Enable anyway" (per-path session override in `largeFileOverrides`). Lint toggles through `lintCompartment` precisely because of the stable-identity invariant above — don't switch it by rebuilding the extensions array. Distinct from the hard `fs_read_file` size cap (Rust), which refuses the file entirely.
- Runtime reconfiguration goes through the exported Compartments (`languageCompartment`, `vimCompartment`, `wrapCompartment`), not by changing the extensions array.

- The Problems panel + status-bar error counts are **LSP-fed only** (`modules/problems/diagnosticsStore.ts`) — the built-in Lezer `syntaxLinter` never reaches them. No language server on PATH (see `modules/lsp/languages.ts` for the expected binaries) → they stay empty. The LSP workspace root comes from `chatStore.live`, which hydrates after mount — `EditorPane` subscribes to it reactively; a one-shot check races and kills LSP for restored tabs.

## Debugging entry points

- Clicks/cursor land on the wrong line → check computed `zoom` on `.cm-editor` ancestors and the user's persisted `zoomLevel` in `nexis-settings.json` (pitfall #15)
- No diagnostics/hover/completion after app reload → LSP activation race or the language server binary is not installed (`activateLsp` returns null silently in both cases)
- Ghost text weirdness → `inlineExtension.ts` (`suggestionField` + `consumeIfTypedAhead`)
- Language highlighting missing after tab switch → language compartment wiped; see stable-identity invariant above

## Related

[[settings-sync]] (zoomLevel persists via `writePref`) · [[lsp]] · [[debugger]]
