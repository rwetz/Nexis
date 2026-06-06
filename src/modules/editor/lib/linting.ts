// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { syntaxTree } from "@codemirror/language";
import { linter, type Diagnostic } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";

// Cap to avoid flooding the gutter when a single missing delimiter cascades
// into dozens of error nodes (e.g. one missing `}` in a large file).
const MAX_DIAGNOSTICS = 10;

// Walk the Lezer parse tree for nodes the parser could not recover from.
// Works for all languages backed by a proper Lezer grammar (JS/TS, Python,
// Rust, Go, JSON, HTML, CSS, Markdown). Legacy StreamParser languages produce
// no error nodes, so the linter returns nothing for them — acceptable.
export function syntaxLinter(): Extension {
  return linter(
    (view) => {
      const diagnostics: Diagnostic[] = [];
      const cursor = syntaxTree(view.state).cursor();
      do {
        if (cursor.type.isError && cursor.from < cursor.to) {
          diagnostics.push({
            from: cursor.from,
            to: cursor.to,
            severity: "error",
            message: "Syntax error",
          });
          if (diagnostics.length >= MAX_DIAGNOSTICS) break;
        }
      } while (cursor.next());
      return diagnostics;
    },
    { delay: 400 },
  );
}
