// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Renders a document to PDF bytes with Forme.
 *
 * The engine is imported through Forme's `worker` entry, not `browser`. The
 * browser entry is a wasm-pack "bundler" build that imports the `.wasm` as an
 * ES module, which Vite does not support without a plugin. The worker entry
 * takes the module from us, so the WASM is emitted as a hashed asset (`?url`)
 * and fetched from the app's own origin, which `connect-src 'self'` in the
 * CSP already allows, and only on the first export.
 */
import type { JSONContent } from "@tiptap/core";
import type { PdfPageSize, PdfTheme } from "./pdfThemes";

export async function renderDocumentPdf(
  doc: JSONContent,
  opts: { title: string; theme: PdfTheme; size: PdfPageSize },
): Promise<Uint8Array> {
  const [{ init, renderPdf }, { serialize }, { default: wasmUrl }, { pdfDocumentFor }] =
    await Promise.all([
      import("@formepdf/core/worker"),
      import("@formepdf/react"),
      import("@formepdf/core/pkg-web/forme_bg.wasm?url"),
      import("./pdfDocument"),
    ]);
  await init(new URL(wasmUrl, window.location.href));
  // Serialized here rather than through `renderDocument`, which imports its
  // own copy of the serializer: pdfcn found that a second copy does not
  // recognise the first one's primitives and can drop nested pages.
  return renderPdf(JSON.stringify(serialize(pdfDocumentFor(doc, opts))));
}
