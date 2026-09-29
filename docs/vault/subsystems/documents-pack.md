---
type: subsystem
description: The Documents pack's rich-text editor for markdown and .docx, why saves are guarded the way they are, the PDF export path, and the chunking trap it hit.
---

# Documents pack

Added 2026-09-29. The `documents` pack puts a Tiptap editor behind a `document` tab kind (one tab per file) and a `documents-home` tab (the list, New, Open) opened from the title bar. Markdown and `.docx` are read and written in their own formats. The editor's JSON is also rendered to PDF. What shipped is in CHANGELOG `[Unreleased]`.

## Key files

- `src/modules/documents/lib/extensions.ts` — the single schema. The docx and PDF mappers walk JSON shaped by it; a node added here needs a case in both (unknown nodes fall back to their text, never vanish).
- `lib/markdownFormat.ts` — hazard detection plus output normalisation.
- `lib/docxInspect.ts` / `lib/docxFormat.ts` — what a rebuild would lose; mammoth in, `docx` out.
- `lib/pdfDocument.tsx` (pure tree) / `lib/pdfExport.ts` (engine load) / `lib/pdfThemes.ts` (from pdfcn).
- `DocumentEditor.tsx` — load, banners, save flow, export. `SaveDocxDialog.tsx`. `DocumentStack.tsx`, `DocumentsPanel.tsx`.
- Routing is in `App.tsx:handleOpenFile`. `.docx` goes to a document tab, or to `persistSidebarView("documents")` when the pack is off, which renders `PackGatePlaceholder`.

## Invariants / gotchas

- **Saves never silently rewrite what the editor can't hold.** Both halves were measured, not assumed; the tests pin the measurements.
  - Markdown: `@tiptap/markdown` 3.31 turns frontmatter into `---` plus an `## title:` heading, strips HTML and escapes footnotes. `detectMarkdownHazards` opens such files read-only. `markdownFormat.test.ts` has a test asserting frontmatter is *still* destroyed; when an upgrade fixes that, the test fails and the hazard can go.
  - Docx: a save rebuilds the file. `inspectDocx` reads the zip itself because mammoth only warns about what it tried to convert. Headers, comments and fonts it ignores silently. A file Nexis wrote must inspect clean (a test asserts it), which is why the exporter omits `<w:jc>` for left alignment.
- **Loading is not an edit.** `setContent` runs with `emitUpdate: false` inside `setMeta("addToHistory", false)`, so opening a file doesn't mark it dirty and Ctrl+Z can't undo it back to empty.
- **Zoom:** AGENTS.md pitfall #15 applies; `.zoom-content .ProseMirror` is exempt and `documents.css` scales the font.
- **Chunking:** the React vendor rule in `vite.config.ts` matches `/react/`, which also matches `@tiptap/react/`. A dedicated `documents-editor` rule has to sit before it. That rule must not claim `w3c-keyname`, because CodeMirror shares it and it would drag the chunk into the startup preload set. Check `dist/index.html` after touching either rule.
- **Forme loads through its `worker` entry** with the WASM as a `?url` asset. The `browser` entry imports `.wasm` as an ES module, which Vite can't do without a plugin.
- **The title-bar tool opens a tab, not a sidebar view.** App heals any permanent tool's view back to Files. The `documents` view id exists for pack gating and the placeholder.

## Debugging entry points

- A `.docx` opens as "binary" in the code editor → `handleOpenFile` routing, or the pack is off and the placeholder was dismissed.
- Clicks land on the wrong line → the `.ProseMirror` exemption in `globals.css`.
- The first PDF export fails → the network tab for `forme_bg-*.wasm` (CSP `connect-src 'self'`).

## Not built yet

- Editing a `.docx` in place (patching `document.xml`) instead of rebuilding it.
- Restoring document tabs after a restart, and reloading on external change.

## Related

[[expansion-packs]] · [[navigation-surfaces]] · [[editor]] · [[art-pack]]
