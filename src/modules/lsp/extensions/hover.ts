// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { hoverTooltip, type Tooltip } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { hoverToMarkdown } from "../protocol";

function offsetToLspPos(
  doc: { lineAt(offset: number): { number: number; from: number } },
  offset: number,
): { line: number; character: number } {
  const line = doc.lineAt(offset);
  return { line: line.number - 1, character: offset - line.from };
}

function renderMarkdown(text: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "cm-lsp-hover";
  // Simple inline Markdown: code blocks, bold, italic
  const lines = text.split("\n");
  let inCode = false;
  let codeLines: string[] = [];
  let codeLanguage = "";

  for (const raw of lines) {
    const line = raw;
    if (line.startsWith("```")) {
      if (!inCode) {
        inCode = true;
        codeLanguage = line.slice(3).trim();
        codeLines = [];
      } else {
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        if (codeLanguage) code.className = `language-${codeLanguage}`;
        code.textContent = codeLines.join("\n");
        pre.appendChild(code);
        el.appendChild(pre);
        inCode = false;
        codeLanguage = "";
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    if (!line.trim()) {
      el.appendChild(document.createElement("br"));
      continue;
    }
    const p = document.createElement("p");
    // Inline code `...`
    const parts = line.split(/(`[^`]+`)/g);
    for (const part of parts) {
      if (part.startsWith("`") && part.endsWith("`")) {
        const code = document.createElement("code");
        code.textContent = part.slice(1, -1);
        p.appendChild(code);
      } else {
        p.appendChild(document.createTextNode(part));
      }
    }
    el.appendChild(p);
  }
  return el;
}

/** Build a hover tooltip extension powered by an LSP session. */
export function lspHoverExtension(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getEntry: () => any | null,
  getPath: () => string,
): Extension {
  return hoverTooltip(
    async (view: EditorView, pos: number): Promise<Tooltip | null> => {
      const entry = getEntry();
      if (!entry) return null;

      const lspPos = offsetToLspPos(view.state.doc, pos);
      const { lspClient } = await import("../client");
      const hover = await lspClient.hover(entry, getPath(), lspPos.line, lspPos.character);
      if (!hover) return null;

      const markdown = hoverToMarkdown(hover.contents);
      if (!markdown.trim()) return null;

      // Compute range for tooltip anchor
      let from = pos;
      let to = pos;
      if (hover.range) {
        const startLine = view.state.doc.line(hover.range.start.line + 1);
        const endLine = view.state.doc.line(hover.range.end.line + 1);
        from = startLine.from + hover.range.start.character;
        to = endLine.from + hover.range.end.character;
      }

      return {
        pos: from,
        end: to,
        above: true,
        create() {
          return { dom: renderMarkdown(markdown) };
        },
      };
    },
    { hoverTime: 400 },
  );
}
