import { describe, expect, it } from "vitest";
import { highlightLine, highlightLines, previewStart } from "./miniHighlight";
import { languageOf, plainInline, previewKind, typeLabel } from "./previewKind";

describe("previewKind", () => {
  it("classifies by extension, case-insensitively", () => {
    expect(previewKind("/w/Logo.PNG")).toBe("image");
    expect(previewKind("C:\\w\\app.tsx")).toBe("code");
    expect(previewKind("/w/README.md")).toBe("text");
    expect(previewKind("/w/font.ttf")).toBe("binary");
    expect(previewKind("/w/.gitignore")).toBe("text");
    expect(previewKind("/w/Dockerfile")).toBe("code");
  });

  it("tries unknown extensions as text", () => {
    expect(previewKind("/w/notes.weird")).toBe("text");
  });

  it("labels languages and types", () => {
    expect(languageOf("/w/main.rs")).toEqual({ label: "Rust", family: "c" });
    expect(languageOf("/w/a.py")?.family).toBe("hash");
    expect(typeLabel("/w/a.png")).toBe("PNG image");
    expect(typeLabel("/w/a.md")).toBe("Markdown");
    expect(typeLabel("/w/a.woff2")).toBe("Font");
  });
});

describe("highlightLine", () => {
  const kinds = (line: string, fam: Parameters<typeof highlightLine>[1] = "c") =>
    highlightLine(line, fam).map((t) => `${t.kind}:${t.text}`);

  it("marks keywords, calls, strings, numbers and comments", () => {
    expect(kinds('const x = load("a", 42); // note')).toEqual([
      "keyword:const",
      "plain: x = ",
      "call:load",
      "plain:(",
      'string:"a"',
      "plain:, ",
      "number:42",
      "plain:); ",
      "comment:// note",
    ]);
  });

  it("uses each family's comment marker", () => {
    expect(kinds("x = 1 # hi", "hash").slice(-1)[0]).toBe("comment:# hi");
    expect(kinds("select 1 -- hi", "sql").slice(-1)[0]).toBe("comment:-- hi");
    expect(kinds("a // b", "hash")).not.toContain("comment:// b");
  });

  it("keeps an escaped quote inside its string and survives an unclosed one", () => {
    expect(kinds('"a\\"b" x')[0]).toBe('string:"a\\"b"');
    expect(kinds('"open').join("")).toContain('string:"open');
  });

  it("does not read the digits of an identifier as a number", () => {
    expect(kinds("v2 = x1")).toEqual(["plain:v2 = x1"]);
  });

  it("marks markup tags", () => {
    expect(kinds('<div class="a">', "markup")[0]).toBe("tag:<div");
  });

  it("round-trips the line text exactly", () => {
    const line = 'fn main() { let s = "x"; } /* end */';
    expect(highlightLine(line, "c").map((t) => t.text).join("")).toBe(line);
  });
});

describe("highlightLines", () => {
  it("keeps the inside of a block comment a comment", () => {
    const lines = ["/**", " * for each item, return from here", " */", "const a = 1;"];
    const out = highlightLines(lines, "c");
    expect(out[1].every((t) => t.kind === "comment")).toBe(true);
    expect(out[3][0]).toEqual({ text: "const", kind: "keyword" });
  });

  it("resumes code after a block comment closes mid-line", () => {
    const out = highlightLines(["/* a", "b */ let x"], "c");
    expect(out[1].map((t) => t.kind)).toEqual(["comment", "plain", "keyword", "plain"]);
  });
});

describe("previewStart", () => {
  it("skips a header comment that fills the first screen", () => {
    const lines = [...Array(20).fill("// banner"), "import x from 'y';"];
    expect(previewStart(highlightLines(lines, "c"), 15)).toBe(19);
  });

  it("starts at the top when code appears early", () => {
    expect(previewStart(highlightLines(["// hi", "const a = 1;"], "c"), 15)).toBe(0);
  });
});

describe("plainInline", () => {
  it("strips links, emphasis and code spans but keeps their text", () => {
    expect(plainInline("Some **bold** and a [link](https://x.dev).")).toBe("Some bold and a link.");
    expect(plainInline("_it_ and `code` and ![alt](i.png)")).toBe("it and code and alt");
  });

  it("leaves a lone marker alone", () => {
    expect(plainInline("a * b")).toBe("a * b");
  });
});
