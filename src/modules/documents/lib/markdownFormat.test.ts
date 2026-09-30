// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { documentExtensions } from "./extensions";
import { detectMarkdownHazards, normalizeMarkdownOutput } from "./markdownFormat";

function roundTrip(md: string): string {
  const ed = new Editor({
    extensions: documentExtensions(),
    content: md,
    contentType: "markdown",
  });
  const out = normalizeMarkdownOutput(ed.getMarkdown());
  ed.destroy();
  return out;
}

describe("markdown round-trip", () => {
  // Each of these must come back byte for byte. A failure here means an
  // editor upgrade started rewriting ordinary files on save.
  it.each([
    "# Title\n\nSome **bold** and *italic* and `code` and [a link](https://x.dev).\n",
    "- one\n- two\n  - nested\n\n1. first\n2. second\n",
    "- [ ] todo\n- [x] done\n",
    "```ts\nconst a = 1;\n```\n",
    "> quote\n\n---\n\n![alt](https://x.dev/i.png)\n",
    "Line one  \nhard break\n",
    "~~strike~~ and ==mark==\n",
  ])("preserves %j", (md) => {
    expect(roundTrip(md)).toBe(md);
  });

  it("keeps a table's cells, re-padding only its columns", () => {
    expect(roundTrip("| a | b |\n| --- | --- |\n| 1 | 2 |\n")).toBe(
      "| a   | b   |\n| --- | --- |\n| 1   | 2   |\n",
    );
  });

  it("adds no blank line above a table that follows a paragraph", () => {
    expect(roundTrip("Intro.\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n")).toBe(
      "Intro.\n\n| a   | b   |\n| --- | --- |\n| 1   | 2   |\n",
    );
  });

  it("keeps blank lines inside fenced code exactly", () => {
    const md = "```\na\n\n\n\nb\n```\n";
    expect(roundTrip(md)).toBe(md);
  });

  it("is stable: a second round-trip changes nothing", () => {
    const once = roundTrip("| a | b |\n| --- | --- |\n| 1 | 2 |\n\n- x\n");
    expect(roundTrip(once)).toBe(once);
  });

  // Pins the reason detectMarkdownHazards exists. If the serializer learns
  // to keep frontmatter, this fails and the hazard can be retired.
  it("still destroys frontmatter (why it is a hazard)", () => {
    expect(roundTrip("---\ntitle: x\n---\n\n# Body\n")).not.toContain("title: x\n---");
  });
});

describe("detectMarkdownHazards", () => {
  it("finds nothing in ordinary markdown", () => {
    expect(detectMarkdownHazards("# A\n\n- b\n\n`<div>` is fine inline\n")).toEqual([]);
  });

  it("flags frontmatter only at the very start", () => {
    expect(detectMarkdownHazards("---\ntitle: x\n---\n# A\n")).toContain("frontmatter");
    expect(detectMarkdownHazards("# A\n\n---\n\ntext\n\n---\n")).not.toContain("frontmatter");
  });

  it("flags raw HTML and comments, but not autolinks or comparisons", () => {
    expect(detectMarkdownHazards("text <span>x</span>\n")).toEqual(["raw-html"]);
    expect(detectMarkdownHazards("<!-- note -->\n")).toEqual(["raw-html"]);
    expect(detectMarkdownHazards("<https://x.dev>\n")).toEqual([]);
    expect(detectMarkdownHazards("if a < b and c > d\n")).toEqual([]);
  });

  it("flags footnotes and reference definitions", () => {
    expect(detectMarkdownHazards("x[^1]\n\n[^1]: note\n")).toEqual(["footnotes"]);
    expect(detectMarkdownHazards("[l][r]\n\n[r]: https://x.dev\n")).toEqual(["reference-links"]);
  });

  it("ignores everything inside fenced code", () => {
    const md = "```html\n<div>[^1]</div>\n[r]: x\n```\n\n~~~\n<b>\n~~~\n";
    expect(detectMarkdownHazards(md)).toEqual([]);
  });
});
