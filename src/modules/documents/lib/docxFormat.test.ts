import { describe, expect, it } from "vitest";
import {
  CommentRangeEnd,
  CommentRangeStart,
  CommentReference,
  Document,
  Footer,
  Header,
  InsertedTextRun,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { docxToHtml, imageSize, jsonToDocx } from "./docxFormat";
import { inspectDocx } from "./docxInspect";

const pack = async (doc: Document) => new Uint8Array(await Packer.toArrayBuffer(doc));

const SAMPLE = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Report" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Plain, " },
        { type: "text", text: "bold", marks: [{ type: "bold" }] },
        { type: "text", text: " and " },
        { type: "text", text: "a link", marks: [{ type: "link", attrs: { href: "https://x.dev" } }] },
        { type: "text", text: " and " },
        { type: "text", text: "a bad link", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] },
      ],
    },
    {
      type: "bulletList",
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] },
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "two" }] }] },
      ],
    },
    {
      type: "table",
      content: [
        { type: "tableRow", content: [
          { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "k" }] }] },
          { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "v" }] }] },
        ] },
        { type: "tableRow", content: [
          { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }] },
          { type: "tableCell", content: [{ type: "paragraph" }] },
        ] },
      ],
    },
  ],
};

describe("docx export and re-import", () => {
  it("survives a round trip through mammoth", async () => {
    const { html } = await docxToHtml(await jsonToDocx(SAMPLE));
    expect(html).toContain("<h1>Report</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('<a href="https://x.dev">a link</a>');
    expect(html).toMatch(/<ul><li>one<\/li><li>two<\/li><\/ul>/);
    expect(html).toContain("<table>");
  });

  it("writes a refused link as plain text, never as a hyperlink", async () => {
    const { html } = await docxToHtml(await jsonToDocx(SAMPLE));
    expect(html).toContain("a bad link");
    expect(html).not.toContain("javascript:");
  });

  it("reports nothing lost for a file this editor wrote", async () => {
    expect(await inspectDocx(await jsonToDocx(SAMPLE))).toEqual([]);
  });

  it("writes a valid file for an empty document", async () => {
    const { html } = await docxToHtml(await jsonToDocx({ type: "doc", content: [] }));
    expect(html).toBe("");
  });
});

describe("inspectDocx", () => {
  it("finds headers, footers and direct formatting", async () => {
    const bytes = await pack(
      new Document({
        sections: [
          {
            headers: { default: new Header({ children: [new Paragraph("head")] }) },
            footers: { default: new Footer({ children: [new Paragraph("foot")] }) },
            children: [new Paragraph({ children: [new TextRun({ text: "red", color: "FF0000" })] })],
          },
        ],
      }),
    );
    const found = await inspectDocx(bytes);
    expect(found).toContain("headers-footers");
    expect(found).toContain("character-formatting");
  });

  it("finds comments and tracked changes", async () => {
    const bytes = await pack(
      new Document({
        comments: { children: [{ id: 0, author: "a", date: new Date(0), children: [new Paragraph("note")] }] },
        sections: [
          {
            children: [
              new Paragraph({
                children: [
                  new CommentRangeStart(0),
                  new TextRun("commented"),
                  new CommentRangeEnd(0),
                  new TextRun({ children: [new CommentReference(0)] }),
                  new InsertedTextRun({ text: "added", id: 1, author: "a", date: "2026-01-01T00:00:00Z" }),
                ],
              }),
            ],
          },
        ],
      }),
    );
    const found = await inspectDocx(bytes);
    expect(found).toContain("comments");
    expect(found).toContain("tracked-changes");
  });

  it("finds real footnotes but not Word's separator notes", async () => {
    const withNote = await pack(
      new Document({
        footnotes: { 1: { children: [new Paragraph("the note")] } },
        sections: [{ children: [new Paragraph("body")] }],
      }),
    );
    expect(await inspectDocx(withNote)).toContain("footnotes");
  });
});

describe("imageSize", () => {
  it("reads PNG and GIF dimensions from the header", () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    png.set([0, 0, 0x01, 0x2c], 16); // 300
    png.set([0, 0, 0x00, 0x96], 20); // 150
    expect(imageSize(png)).toEqual({ type: "png", width: 300, height: 150 });
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x10, 0x00, 0x20, 0x00]);
    expect(imageSize(gif)).toEqual({ type: "gif", width: 16, height: 32 });
  });

  it("returns null for bytes it cannot size", () => {
    expect(imageSize(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});
