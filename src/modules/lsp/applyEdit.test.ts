// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import {
  applyEditsToText,
  workspaceEditHasChanges,
} from "./applyEdit";
import type { LspTextEdit } from "./protocol";

function edit(
  sl: number,
  sc: number,
  el: number,
  ec: number,
  newText: string,
): LspTextEdit {
  return { range: { start: { line: sl, character: sc }, end: { line: el, character: ec } }, newText };
}

describe("applyEditsToText", () => {
  const src = "const foo = foo + 1;\nreturn foo;\n";

  it("applies multiple same-length edits across lines", () => {
    const edits = [
      edit(0, 6, 0, 9, "bar"),
      edit(0, 12, 0, 15, "bar"),
      edit(1, 7, 1, 10, "bar"),
    ];
    expect(applyEditsToText(src, edits)).toBe(
      "const bar = bar + 1;\nreturn bar;\n",
    );
  });

  it("stays correct when the replacement changes length (offset shift)", () => {
    const edits = [
      edit(0, 6, 0, 9, "longername"),
      edit(0, 12, 0, 15, "longername"),
      edit(1, 7, 1, 10, "longername"),
    ];
    // Order of edits in the array should not matter — they are sorted by
    // descending start offset before applying.
    expect(applyEditsToText(src, edits.slice().reverse())).toBe(
      "const longername = longername + 1;\nreturn longername;\n",
    );
  });

  it("handles a multi-line range deletion", () => {
    // Replace from line0:6 through line1:6 with a single token.
    expect(applyEditsToText(src, [edit(0, 6, 1, 6, "X")])).toBe(
      "const X foo;\n",
    );
  });

  it("clamps out-of-range positions instead of throwing", () => {
    expect(applyEditsToText("abc", [edit(5, 0, 9, 0, "!")])).toBe("abc!");
  });

  it("returns the original text when there are no edits", () => {
    expect(applyEditsToText(src, [])).toBe(src);
  });
});

describe("workspaceEditHasChanges", () => {
  it("is false for null / empty edits", () => {
    expect(workspaceEditHasChanges(null)).toBe(false);
    expect(workspaceEditHasChanges({})).toBe(false);
    expect(workspaceEditHasChanges({ changes: { "file:///a": [] } })).toBe(false);
    expect(workspaceEditHasChanges({ documentChanges: [] })).toBe(false);
  });

  it("is true when changes carry an edit", () => {
    expect(
      workspaceEditHasChanges({ changes: { "file:///a": [edit(0, 0, 0, 1, "x")] } }),
    ).toBe(true);
  });

  it("is true when documentChanges carry an edit", () => {
    expect(
      workspaceEditHasChanges({
        documentChanges: [
          { textDocument: { uri: "file:///a", version: 1 }, edits: [edit(0, 0, 0, 1, "x")] },
        ],
      }),
    ).toBe(true);
  });
});
