// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { detectMonoFontFamily } from "@/lib/fonts";
import { foldService, indentUnit } from "@codemirror/language";
import { lintGutter } from "@codemirror/lint";
import { search } from "@codemirror/search";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

// Compartments allow runtime reconfiguration without rebuilding state.
export const languageCompartment = new Compartment();
export const wrapCompartment = new Compartment();
export const vimCompartment = new Compartment();

// Fold // #region … // #endregion blocks (VS Code compatible).
export const regionFolding = foldService.of((state, lineStart) => {
  const line = state.doc.lineAt(lineStart);
  if (!/\/\/\s*#?region\b/i.test(line.text)) return null;
  let depth = 1;
  let pos = line.to;
  while (pos < state.doc.length) {
    const next = state.doc.lineAt(pos + 1);
    if (/\/\/\s*#?region\b/i.test(next.text)) depth++;
    else if (/\/\/\s*#?endregion\b/i.test(next.text)) {
      if (--depth === 0) return { from: line.to, to: next.from - 1 };
    }
    if (next.to >= state.doc.length) break;
    pos = next.to;
  }
  return null;
});

// Only what basicSetup doesn't already cover, to avoid duplicate extensions.
// basicSetup gives us line numbers, fold gutter, history, indentOnInput,
// bracketMatching, closeBrackets, autocompletion, highlightActiveLine,
// highlightSelectionMatches and the search keymap.
export function buildSharedExtensions(): Extension[] {
  return [
    indentUnit.of("  "),
    EditorState.tabSize.of(2),
    search({ top: true }),
    lintGutter(),
    regionFolding,
    EditorView.theme({
      "&, &.cm-editor, &.cm-editor.cm-focused": {
        backgroundColor: "transparent !important",
        color: "var(--foreground)",
        outline: "none",
        padding: "8px",
      },
      ".cm-scroller": {
        fontFamily: detectMonoFontFamily(),
        // App zoom must reach the editor via font-size, never via an ancestor
        // CSS zoom — .cm-editor is zoom-exempt in globals.css because zoomed
        // clicks land on the wrong line in WebKitGTK (CLAUDE.md pitfall #15).
        fontSize: "calc(13px * var(--app-zoom, 1))",
        lineHeight: "1.55",
        backgroundColor: "transparent !important",
      },
      ".cm-content": {
        caretColor: "var(--foreground)",
        backgroundColor: "transparent !important",
      },
      ".cm-gutters": {
        backgroundColor: "transparent !important",
        color: "var(--muted-foreground)",
      },
      ".cm-gutter-lint": {
        width: "16px",
      },
      ".cm-lint-marker": {
        width: "10px",
        height: "10px",
        marginLeft: "3px",
      },
      ".cm-lint-marker-error": {
        color: "var(--destructive)",
      },
      ".cm-lint-marker-warning": {
        color: "hsl(38 92% 50%)",
      },
      ".cm-gutter": { backgroundColor: "transparent !important" },
      ".cm-lineNumbers .cm-gutterElement": {
        opacity: "0.55",
      },
      ".cm-foldGutter": { width: "10px" },
      ".cm-foldGutter .cm-gutterElement": {
        color: "var(--muted-foreground)",
        opacity: "0.5",
      },
      // Inline placeholder shown in place of folded ranges (the "…" pill).
      // Overrides CodeMirror's hardcoded light-gray base-theme box so it
      // adapts to each theme's palette via CSS variables.
      ".cm-foldPlaceholder": {
        backgroundColor:
          "color-mix(in srgb, var(--foreground) 7%, transparent)",
        border:
          "1px solid color-mix(in srgb, var(--foreground) 14%, transparent)",
        color: "var(--muted-foreground)",
        borderRadius: "4px",
        margin: "0 3px",
        padding: "0 5px",
        fontSize: "0.8em",
        verticalAlign: "baseline",
        cursor: "pointer",
        transition: "background-color 100ms ease, color 100ms ease",
      },
      ".cm-foldPlaceholder:hover": {
        backgroundColor:
          "color-mix(in srgb, var(--foreground) 12%, transparent)",
        color: "var(--foreground)",
      },
      ".cm-activeLine": {
        borderTopRightRadius: "5px",
        borderBottomRightRadius: "5px",
        backgroundColor:
          "color-mix(in srgb, var(--foreground) 4%, transparent)",
      },
      ".cm-lineNumbers .cm-activeLineGutter": {
        borderTopLeftRadius: "5px",
        borderBottomLeftRadius: "5px",
        userSelect: "none",
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "var(--foreground)",
      },
      // Vim normal-mode block cursor — translucent foreground, no rose hue.
      ".cm-fat-cursor": {
        background:
          "color-mix(in srgb, var(--foreground) 35%, transparent) !important",
        outline:
          "1px solid color-mix(in srgb, var(--foreground) 55%, transparent) !important",
        color: "var(--foreground) !important",
      },
      "&:not(.cm-focused) .cm-fat-cursor": {
        background: "transparent !important",
        outline:
          "1px solid color-mix(in srgb, var(--foreground) 35%, transparent) !important",
      },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection":
        {
          backgroundColor:
            "color-mix(in srgb, var(--foreground) 18%, transparent) !important",
        },
      ".cm-panels": {
        backgroundColor: "var(--popover)",
        color: "var(--popover-foreground)",
        borderColor: "var(--border)",
      },
      // Lint/hover tooltips: CM's base theme paints these light gray, which
      // reads as broken white boxes on the app's dark themes (none of the
      // bundled editor themes style tooltips).
      ".cm-tooltip": {
        backgroundColor: "var(--popover)",
        color: "var(--popover-foreground)",
        border: "1px solid var(--border)",
        borderRadius: "6px",
        overflow: "hidden",
      },
      ".cm-tooltip .cm-diagnostic": {
        padding: "4px 8px",
        fontSize: "11px",
      },
      ".cm-tooltip-lint": {
        maxWidth: "480px",
      },
    }),
  ];
}
