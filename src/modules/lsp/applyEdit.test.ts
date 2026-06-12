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

  it("applies same-position inserts in array order (LSP spec)", () => {
    // Two zero-width inserts at the same position: the spec says the result
    // follows array order. Bottom-up application reverses it unless equal
    // offsets tiebreak by index.
    const edits = [edit(0, 0, 0, 0, "A"), edit(0, 0, 0, 0, "B")];
    expect(applyEditsToText("rest", edits)).toBe("ABrest");
  });

  it("counts positions in UTF-16 code units (astral chars are 2 units)", () => {
    // 😀 is one grapheme but two UTF-16 units — LSP positions count units,
    // and so do JS string offsets. '1' sits at unit index 11.
    expect(applyEditsToText("const 😀 = 1;", [edit(0, 11, 0, 12, "2")])).toBe(
      "const 😀 = 2;",
    );
  });

  it("handles CRLF documents (line starts track \\n, ranges span lines)", () => {
    const crlf = "alpha\r\nbeta\r\ngamma\r\n";
    // Replace 'beta' on line 1.
    expect(applyEditsToText(crlf, [edit(1, 0, 1, 4, "BETA")])).toBe(
      "alpha\r\nBETA\r\ngamma\r\n",
    );
    // Multi-line range across the CRLF boundary.
    expect(applyEditsToText(crlf, [edit(0, 5, 1, 0, " ")])).toBe(
      "alpha beta\r\ngamma\r\n",
    );
  });

  it("clamps a character offset past the end of its line to text length only at EOF", () => {
    // Character beyond line end on the last line: offset resolver clamps to
    // text length rather than reading into the void.
    expect(applyEditsToText("ab", [edit(0, 99, 0, 100, "!")])).toBe("ab!");
  });

  it("treats a negative line as document start", () => {
    expect(applyEditsToText("xyz", [edit(-1, 0, 0, 1, "Q")])).toBe("Qyz");
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
