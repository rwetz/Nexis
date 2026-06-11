// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Apply an LSP WorkspaceEdit to disk.
 *
 * Used by the semantic rename path: the language server returns a set of
 * per-file text edits (line/character ranges), which we read → splice →
 * write back. Edits within a file are applied from the bottom up so earlier
 * offsets stay valid as the document shrinks/grows.
 */
import { native } from "@/modules/ai/lib/native";
import { uriToPath, type LspTextEdit, type LspWorkspaceEdit } from "./protocol";

/** Convert a (line, character) position to a string offset within `text`. */
function buildOffsetResolver(text: string): (line: number, ch: number) => number {
  const lineStarts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") lineStarts.push(i + 1);
  }
  return (line, ch) => {
    if (line < 0) return 0;
    if (line >= lineStarts.length) return text.length;
    return Math.min(lineStarts[line] + ch, text.length);
  };
}

/** Apply a file's edits to its text. Pure — no I/O. Exported for tests. */
export function applyEditsToText(text: string, edits: LspTextEdit[]): string {
  const toOffset = buildOffsetResolver(text);
  // Sort by start offset descending so applying one edit never shifts the
  // offsets of edits that come before it.
  const sorted = [...edits].sort(
    (a, b) =>
      toOffset(b.range.start.line, b.range.start.character) -
      toOffset(a.range.start.line, a.range.start.character),
  );
  let out = text;
  for (const e of sorted) {
    const start = toOffset(e.range.start.line, e.range.start.character);
    const end = toOffset(e.range.end.line, e.range.end.character);
    out = out.slice(0, start) + e.newText + out.slice(end);
  }
  return out;
}

/**
 * Collect edits keyed by file URI from either WorkspaceEdit shape
 * (`changes` map or `documentChanges` array).
 */
function collectByUri(edit: LspWorkspaceEdit): Map<string, LspTextEdit[]> {
  const byUri = new Map<string, LspTextEdit[]>();
  if (edit.changes) {
    for (const [uri, edits] of Object.entries(edit.changes)) {
      byUri.set(uri, [...(byUri.get(uri) ?? []), ...edits]);
    }
  }
  if (edit.documentChanges) {
    for (const dc of edit.documentChanges) {
      const uri = dc.textDocument.uri;
      byUri.set(uri, [...(byUri.get(uri) ?? []), ...dc.edits]);
    }
  }
  return byUri;
}

/**
 * Apply a WorkspaceEdit to disk. Returns the number of files actually changed.
 */
export async function applyWorkspaceEdit(
  edit: LspWorkspaceEdit,
): Promise<number> {
  const byUri = collectByUri(edit);
  let changed = 0;
  for (const [uri, edits] of byUri) {
    if (edits.length === 0) continue;
    const path = uriToPath(uri);
    const res = await native.readFile(path);
    if (res.kind !== "text") continue;
    const updated = applyEditsToText(res.content, edits);
    if (updated !== res.content) {
      await native.writeFile(path, updated);
      changed++;
    }
  }
  return changed;
}

/** True when a WorkspaceEdit carries at least one concrete edit. */
export function workspaceEditHasChanges(
  edit: LspWorkspaceEdit | null,
): edit is LspWorkspaceEdit {
  if (!edit) return false;
  if (edit.changes && Object.values(edit.changes).some((e) => e.length > 0)) {
    return true;
  }
  if (
    edit.documentChanges &&
    edit.documentChanges.some((dc) => dc.edits.length > 0)
  ) {
    return true;
  }
  return false;
}
