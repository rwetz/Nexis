import { describe, expect, it } from "vitest";
import { renderPdf } from "@formepdf/core";
import { serialize } from "@formepdf/react";
import { pdfDocumentFor } from "./pdfDocument";
import { PDF_THEMES } from "./pdfThemes";

const DOC = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Quarterly notes" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Body with " },
        { type: "text", text: "bold", marks: [{ type: "bold" }, { type: "italic" }] },
        { type: "text", text: " and ", marks: [] },
        { type: "text", text: "a link", marks: [{ type: "link", attrs: { href: "https://x.dev" } }] },
      ],
    },
    { type: "orderedList", content: [
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "first" }] }] },
    ] },
    { type: "taskList", content: [
      { type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "done" }] }] },
    ] },
    { type: "codeBlock", content: [{ type: "text", text: "let a = 1;" }] },
    { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "quoted" }] }] },
    { type: "horizontalRule" },
    { type: "image", attrs: { src: "https://x.dev/i.png", alt: "chart" } },
    { type: "table", content: [
      { type: "tableRow", content: [
        { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "k" }] }] },
      ] },
      { type: "tableRow", content: [
        { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "v" }] }] },
      ] },
    ] },
    { type: "mysteryNode", content: [{ type: "text", text: "kept as text" }] },
  ],
};

describe("pdfDocumentFor", () => {
  it.each(PDF_THEMES.map((t) => [t.id, t] as const))("renders a real PDF with the %s theme", async (_id, theme) => {
    const tree = serialize(pdfDocumentFor(DOC, { title: "Notes", theme, size: "A4" }));
    const bytes = await renderPdf(JSON.stringify(tree));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("keeps an unknown node's text and never fetches a linked image", () => {
    const json = JSON.stringify(
      serialize(pdfDocumentFor(DOC, { title: "Notes", theme: PDF_THEMES[0], size: "Letter" })),
    );
    expect(json).toContain("kept as text");
    expect(json).toContain("chart: ");
    expect(json).not.toMatch(/"src":"https:\/\/x\.dev\/i\.png"/);
  });

  it("renders an empty document", async () => {
    const tree = serialize(pdfDocumentFor({ type: "doc" }, { title: "", theme: PDF_THEMES[1], size: "A4" }));
    const bytes = await renderPdf(JSON.stringify(tree));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});
