import type { CodeSnippet } from "@/modules/snippets/codeSnippets";
import type { EditorView } from "@codemirror/view";

function getIndent(line: string): string {
  return line.match(/^(\s*)/)?.[1] ?? "";
}

function expandBody(body: string, indent: string): { text: string; cursorOffset: number } {
  let cursor = -1;
  let text = body
    .replace(/\$0/g, () => { cursor = 0; return ""; })
    .replace(/\$\d+/g, "");

  const lines = text.split("\n");
  const indented = lines.map((l, i) => (i === 0 ? l : indent + l)).join("\n");

  if (cursor !== -1) {
    const plain = body.replace(/\$\d+/g, "");
    const beforeFinal = plain.split("$0")[0] ?? plain;
    const bLines = beforeFinal.split("\n");
    const lastLineLen = bLines[bLines.length - 1]?.length ?? 0;
    if (bLines.length > 1) {
      cursor = indent.length + lastLineLen;
    } else {
      cursor = lastLineLen;
    }
    return { text: indented, cursorOffset: cursor };
  }

  // No $0 — put cursor at first $1 position, or at end
  const firstStop = body.split("$1")[0] ?? body;
  const fsLines = firstStop.split("\n");
  const fsLastLen = fsLines[fsLines.length - 1]?.length ?? 0;
  if (fsLines.length > 1) {
    cursor = indent.length + fsLastLen;
  } else {
    cursor = fsLastLen;
  }
  return { text: indented, cursorOffset: cursor };
}

export function tryExpandSnippet(
  view: EditorView,
  snippets: CodeSnippet[],
  lang: string | null,
): boolean {
  const { state } = view;
  const { from } = state.selection.main;
  if (!state.selection.main.empty) return false;

  const line = state.doc.lineAt(from);
  const textBefore = line.text.slice(0, from - line.from);
  const wordMatch = textBefore.match(/(\S+)$/);
  if (!wordMatch) return false;
  const word = wordMatch[1];

  const matchedSnippet = snippets.find(
    (s) =>
      s.prefix === word &&
      (s.language === "any" || s.language === lang || lang === null),
  );
  if (!matchedSnippet) return false;

  const indent = getIndent(line.text);
  const { text, cursorOffset } = expandBody(matchedSnippet.body, indent);

  const replaceFrom = from - word.length;
  const textLines = text.split("\n");
  const lastLineStart =
    textLines.length === 1
      ? replaceFrom
      : replaceFrom + text.lastIndexOf("\n") + 1;

  view.dispatch({
    changes: { from: replaceFrom, to: from, insert: text },
    selection: { anchor: lastLineStart + cursorOffset },
  });
  return true;
}
