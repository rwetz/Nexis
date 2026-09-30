// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * PDF export themes, trimmed from pdfcn's theme registry
 * (https://github.com/shadcn-labs/pdfcn, apps/web/registry/themes).
 * pdfcn is MIT licensed, Copyright (c) 2026 Shadcn Labs.
 *
 * Only themes set in the PDF standard fonts are carried over. pdfcn's
 * "elegant" and similar presets name web fonts that Forme would fetch over
 * the network at export time, and an export should not depend on the network.
 */

export type PdfTheme = {
  id: string;
  label: string;
  colors: {
    foreground: string;
    mutedForeground: string;
    accent: string;
    border: string;
    muted: string;
  };
  body: { fontFamily: string; fontSize: number; lineHeight: number };
  heading: {
    fontFamily: string;
    fontWeight: number;
    lineHeight: number;
    /** h1..h6 */
    sizes: readonly [number, number, number, number, number, number];
  };
  margin: { top: number; right: number; bottom: number; left: number };
  paragraphGap: number;
};

export const PDF_THEMES: readonly PdfTheme[] = [
  {
    id: "minimal",
    label: "Minimal",
    colors: {
      foreground: "#18181b",
      mutedForeground: "#a1a1aa",
      accent: "#71717a",
      border: "#e4e4e7",
      muted: "#fafafa",
    },
    body: { fontFamily: "Helvetica", fontSize: 11, lineHeight: 1.65 },
    heading: { fontFamily: "Courier", fontWeight: 600, lineHeight: 1.25, sizes: [24, 20, 16, 14, 12, 10] },
    margin: { top: 72, right: 56, bottom: 72, left: 56 },
    paragraphGap: 14,
  },
  {
    id: "professional",
    label: "Professional",
    colors: {
      foreground: "#18181b",
      mutedForeground: "#71717a",
      accent: "#3b82f6",
      border: "#e4e4e7",
      muted: "#f4f4f5",
    },
    body: { fontFamily: "Helvetica", fontSize: 11, lineHeight: 1.6 },
    // pdfcn names this "Times-Roman", which Forme does not recognise: it falls
    // back to Helvetica without a warning. The family is "Times" (Forme picks
    // Times-Roman or Times-Bold from the weight). pdfThemes.test.ts pins it.
    heading: { fontFamily: "Times", fontWeight: 700, lineHeight: 1.25, sizes: [26, 20, 16, 14, 12, 11] },
    margin: { top: 72, right: 72, bottom: 72, left: 72 },
    paragraphGap: 12,
  },
  {
    id: "modern",
    label: "Modern",
    colors: {
      foreground: "#0f172a",
      mutedForeground: "#64748b",
      accent: "#6366f1",
      border: "#e2e8f0",
      muted: "#f8fafc",
    },
    body: { fontFamily: "Helvetica", fontSize: 11, lineHeight: 1.6 },
    heading: { fontFamily: "Helvetica", fontWeight: 700, lineHeight: 1.2, sizes: [26, 20, 16, 14, 12, 11] },
    margin: { top: 56, right: 56, bottom: 56, left: 56 },
    paragraphGap: 12,
  },
];

export type PdfPageSize = "A4" | "Letter";
