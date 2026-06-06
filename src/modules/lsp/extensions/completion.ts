// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import {
  type CompletionContext,
  type CompletionResult,
  type Completion,
} from "@codemirror/autocomplete";
import { type LspCompletionItem, LSP_COMPLETION_KIND_NAMES } from "../protocol";

const KIND_BOOST: Partial<Record<string, number>> = {
  Function: 5, Method: 5, Constructor: 5,
  Variable: 4, Field: 4, Property: 4,
  Class: 3, Interface: 3, Struct: 3, Enum: 3, Module: 3,
  Keyword: 2,
};

/** Map LSP completion kind to a CodeMirror type string. */
function kindToType(kind?: number): string {
  if (!kind) return "text";
  const name = LSP_COMPLETION_KIND_NAMES[kind as keyof typeof LSP_COMPLETION_KIND_NAMES];
  if (!name) return "text";
  const lower = name.toLowerCase();
  if (["function", "method", "constructor"].includes(lower)) return "function";
  if (["variable", "field", "property"].includes(lower)) return "variable";
  if (["class", "interface", "struct", "enum"].includes(lower)) return "class";
  if (["module", "namespace", "folder"].includes(lower)) return "namespace";
  if (lower === "keyword") return "keyword";
  if (lower === "constant") return "constant";
  if (lower === "snippet") return "text";
  return "text";
}

function lspItemToCompletion(item: LspCompletionItem): Completion {
  const label = item.label;
  const insert = item.textEdit?.newText ?? item.insertText ?? label;
  const typeName = item.kind
    ? LSP_COMPLETION_KIND_NAMES[item.kind as keyof typeof LSP_COMPLETION_KIND_NAMES]
    : undefined;

  let docText: string | undefined;
  if (item.documentation) {
    docText =
      typeof item.documentation === "string"
        ? item.documentation
        : item.documentation.value;
  }
  if (!docText && item.detail) docText = item.detail;

  return {
    label,
    apply: insert !== label ? insert : undefined,
    type: kindToType(item.kind),
    detail: item.detail,
    info: docText ?? undefined,
    boost: typeName ? (KIND_BOOST[typeName] ?? 0) : 0,
  };
}

/**
 * Build a CodeMirror CompletionResult from a list of LSP completion items.
 * `wordStart` is the character offset where the current word token starts.
 */
export function buildCompletionResult(
  items: LspCompletionItem[],
  wordStart: number,
  cursorPos: number,
): CompletionResult | null {
  if (!items.length) return null;

  const completions = items.map(lspItemToCompletion);

  return {
    from: wordStart,
    to: cursorPos,
    options: completions,
    validFor: /^\w*$/,
  };
}

/** Find the start of the current word token before the cursor. */
export function wordStartBefore(
  ctx: CompletionContext,
): number {
  const match = ctx.matchBefore(/[\w.]/);
  return match ? match.from : ctx.pos;
}
