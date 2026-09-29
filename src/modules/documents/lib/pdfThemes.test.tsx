import { describe, expect, it } from "vitest";
import { renderPdf } from "@formepdf/core";
import { serialize } from "@formepdf/react";
import { pdfDocumentFor } from "./pdfDocument";
import { PDF_THEMES } from "./pdfThemes";

const BASE_FONT: Record<string, string> = { Helvetica: "Helvetica", Times: "Times", Courier: "Courier" };

/** The PDF base fonts a rendered document actually embeds. */
async function embeddedFonts(themeIndex: number): Promise<string[]> {
  const doc = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Heading" }] },
      { type: "paragraph", content: [{ type: "text", text: "Body" }] },
    ],
  };
  const tree = serialize(pdfDocumentFor(doc, { title: "t", theme: PDF_THEMES[themeIndex], size: "A4" }));
  const bytes = await renderPdf(JSON.stringify(tree));
  return [...new TextDecoder("latin1").decode(bytes).matchAll(/\/BaseFont\s*\/([\w-]+)/g)].map((m) => m[1]);
}

describe("PDF themes", () => {
  // Forme falls back to Helvetica, silently, for a family name it does not
  // know. pdfcn's "Times-Roman" was one. Every theme's families must land.
  it.each(PDF_THEMES.map((t, i) => [t.id, i] as const))("%s embeds the fonts it names", async (_id, i) => {
    const theme = PDF_THEMES[i];
    const fonts = await embeddedFonts(i);
    for (const family of [theme.heading.fontFamily, theme.body.fontFamily]) {
      expect(BASE_FONT[family], `unknown family ${family}`).toBeDefined();
      expect(fonts.some((f) => f.startsWith(BASE_FONT[family])), `${family} in ${fonts.join(",")}`).toBe(true);
    }
  });
});
