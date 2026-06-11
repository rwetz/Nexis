// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { linter, type Diagnostic } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";

// Cap to avoid flooding the gutter when a single missing delimiter cascades
// into dozens of error nodes (e.g. one missing `}` in a large file).
const MAX_DIAGNOSTICS = 10;

// Minimal shape of a Lezer tree cursor — kept structural so this module
// doesn't need a direct dependency on @lezer/common.
interface ErrorCursor {
  type: { isError: boolean };
  from: number;
  to: number;
  next(): boolean;
}
interface ErrorTree {
  cursor(): ErrorCursor;
}

/**
 * Collect error ranges from a Lezer parse tree. A missing *closing* delimiter
 * surfaces as a zero-width error node (an expected-but-absent token), so those
 * are expanded to a 1-char range — otherwise they render as nothing and the
 * error is invisible (the bug that hid every missing-brace warning). Valid
 * files produce no error nodes at all, so this never fires on good code.
 * Pure and tree-only so it can be unit-tested against real grammars.
 */
export function syntaxErrorRanges(
  tree: ErrorTree,
  docLength: number,
  max: number = MAX_DIAGNOSTICS,
): Array<{ from: number; to: number }> {
  const ranges: { from: number; to: number }[] = [];
  const seen = new Set<string>();
  const cursor = tree.cursor();
  do {
    if (!cursor.type.isError) continue;
    let from = cursor.from;
    let to = cursor.to;
    if (from === to) {
      // Expand a zero-width error so it has something to underline: the char
      // at the position, or the preceding char if we're at end-of-document.
      if (to < docLength) to = from + 1;
      else from = Math.max(0, from - 1);
    }
    if (from >= to) continue;
    const key = `${from}:${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ranges.push({ from, to });
    if (ranges.length >= max) break;
  } while (cursor.next());
  return ranges;
}

// Walk the Lezer parse tree for nodes the parser could not recover from.
// Works for all languages backed by a proper Lezer grammar (JS/TS, Python,
// Rust, Go, JSON, HTML, CSS, Markdown, Java, C/C++). Legacy StreamParser
// languages produce no error nodes, so the linter returns nothing for them —
// `delimiterLinter` covers the common cases for those instead.
export function syntaxLinter(): Extension {
  return linter(
    (view) => {
      // Force a parse to the end so an error near EOF (e.g. a missing final
      // brace) is seen even when it's past the rendered viewport.
      const tree =
        ensureSyntaxTree(view.state, view.state.doc.length, 1000) ??
        syntaxTree(view.state);
      return syntaxErrorRanges(tree, view.state.doc.length).map(
        (r): Diagnostic => ({
          from: r.from,
          to: r.to,
          severity: "error",
          message: "Syntax error",
        }),
      );
    },
    { delay: 400 },
  );
}

// ── Delimiter balance linter ────────────────────────────────────────────────
//
// Legacy StreamParser languages (C#, Kotlin, Lua, Ruby, …) have no Lezer
// grammar, so `syntaxLinter` is silent for them — delete a `}` and nothing is
// flagged. This linter gives those languages a structural floor: it balances
// () [] {} across the document and reports any unmatched, mismatched, or
// unclosed bracket. It does NOT understand statements or tokens, so it only
// catches delimiter errors — but that covers the most common "I deleted a
// brace" mistake for every language it runs on.

const MAX_DELIMITER_PROBLEMS = 20;

// Don't scan enormous files on every keystroke.
const MAX_DELIMITER_DOC_LENGTH = 300_000;

// A bracket only counts if it's real code — brackets inside strings, comments,
// and char/regex literals must be ignored. The node-name test below matches
// both Lezer node names ("String", "LineComment", …) and StreamParser token
// names ("string", "comment", …), so the same predicate works everywhere.
const SKIP_NODE_NAME = /string|comment|char|regex/;

const OPEN_TO_CLOSE: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const CLOSE_TO_OPEN: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

export type DelimiterProblem = { from: number; to: number; message: string };

/**
 * Balance `()[]{}` across `text`, returning a problem for every unmatched,
 * mismatched, or unclosed delimiter. `isSkippable(pos)` returns true for
 * positions that live inside a string/comment/char literal and must be
 * ignored — the caller supplies this from the syntax tree, which keeps this
 * function pure and unit-testable. Stops once `max` problems are found.
 */
export function scanDelimiters(
  text: string,
  isSkippable: (pos: number) => boolean,
  max: number = MAX_DELIMITER_PROBLEMS,
): DelimiterProblem[] {
  const stack: { ch: string; pos: number }[] = [];
  const problems: DelimiterProblem[] = [];

  for (let pos = 0; pos < text.length; pos++) {
    const ch = text[pos]!;
    const isOpen = ch === "(" || ch === "[" || ch === "{";
    const isClose = ch === ")" || ch === "]" || ch === "}";
    if (!isOpen && !isClose) continue;
    if (isSkippable(pos)) continue;

    if (isOpen) {
      stack.push({ ch, pos });
      continue;
    }

    const top = stack[stack.length - 1];
    if (!top) {
      problems.push({ from: pos, to: pos + 1, message: `Unmatched '${ch}'` });
    } else if (top.ch !== CLOSE_TO_OPEN[ch]) {
      problems.push({
        from: pos,
        to: pos + 1,
        message: `Mismatched '${ch}' — expected '${OPEN_TO_CLOSE[top.ch]}'`,
      });
      stack.pop(); // recover by consuming the mismatched opener
    } else {
      stack.pop();
    }
    if (problems.length >= max) return problems;
  }

  for (const open of stack) {
    if (problems.length >= max) break;
    problems.push({
      from: open.pos,
      to: open.pos + 1,
      message: `Unclosed '${open.ch}'`,
    });
  }
  return problems;
}

/**
 * A language-agnostic bracket-balance linter for StreamParser languages that
 * have no Lezer grammar. Attach it (via `resolveLanguage`) only for languages
 * whose brackets are reliably balanced — markup and shell-style `case )` are
 * deliberately excluded by `DELIMITER_CHECK_EXTENSIONS`.
 */
export function delimiterLinter(): Extension {
  return linter(
    (view) => {
      const doc = view.state.doc;
      if (doc.length === 0 || doc.length > MAX_DELIMITER_DOC_LENGTH) return [];

      // Force a parse so string/comment skipping is accurate beyond the
      // viewport; fall back to whatever is parsed if the budget is exceeded.
      const tree =
        ensureSyntaxTree(view.state, doc.length, 1000) ?? syntaxTree(view.state);
      const text = doc.toString();

      const isSkippable = (pos: number): boolean => {
        let node: ReturnType<typeof tree.resolveInner> | null =
          tree.resolveInner(pos, 1);
        for (let depth = 0; node && depth < 8; depth++) {
          if (SKIP_NODE_NAME.test(node.name.toLowerCase())) return true;
          node = node.parent;
        }
        return false;
      };

      return scanDelimiters(text, isSkippable).map((p) => ({
        from: p.from,
        to: p.to,
        severity: "error" as const,
        message: p.message,
      }));
    },
    { delay: 400 },
  );
}

/**
 * File extensions that get the `delimiterLinter`. These are StreamParser
 * (non-Lezer) code languages whose `()[]{}` are reliably balanced. Markup
 * (Markdown/HTML), shell (`case pattern)` is intentionally unbalanced), and
 * config formats are deliberately excluded to avoid false positives. Anything
 * with a real Lezer grammar already gets richer errors from `syntaxLinter`.
 */
export const DELIMITER_CHECK_EXTENSIONS = new Set<string>([
  "cs", // C#
  "kt",
  "kts", // Kotlin
  "scala",
  "dart",
  "swift",
  "lua",
  "rb",
  "rake",
  "gemspec",
  "ru", // Ruby
  "r",
  "hs", // Haskell
  "sql",
  "psql",
  "pgsql",
  "mysql",
  "sqlite",
  "mariadb",
  "mssql",
  "plsql",
  "ps1", // PowerShell
  "scss",
]);
