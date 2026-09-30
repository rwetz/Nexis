// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * What a `.docx` contains that saving from the rich editor would lose.
 *
 * The editor does not edit a .docx in place: it imports the body through
 * mammoth and, on save, writes a new file from what the editor holds. That is
 * the right trade for "fix a typo in a report", and a silent disaster for a
 * contract with tracked changes. This scan is what lets the save dialog say
 * which of the two the user is holding before anything is overwritten.
 *
 * It reads the zip directly rather than trusting mammoth's warnings, because
 * mammoth only warns about what it tried and failed to convert. Headers,
 * comments and fonts it ignores without comment.
 */
import JSZip from "jszip";

export type DocxLoss =
  | "headers-footers"
  | "comments"
  | "tracked-changes"
  | "footnotes"
  | "fields"
  | "text-boxes"
  | "embedded-objects"
  | "sections"
  | "character-formatting"
  | "paragraph-layout";

export const DOCX_LOSS_LABELS: Record<DocxLoss, string> = {
  "headers-footers": "Headers and footers",
  comments: "Comments",
  "tracked-changes": "Tracked changes (they would be accepted as they stand)",
  footnotes: "Footnotes and endnotes",
  fields: "Fields such as a table of contents or page numbers",
  "text-boxes": "Text boxes and shapes",
  "embedded-objects": "Embedded objects and charts",
  sections: "Section breaks, columns and page setup",
  "character-formatting": "Fonts, sizes and text colours",
  "paragraph-layout": "Paragraph alignment, indents and spacing",
};

/** Real notes only. Word writes two separator notes (ids -1 and 0, or typed
 *  `separator`/`continuationSeparator`) into every footnotes.xml it creates,
 *  so the part existing proves nothing. */
function hasRealNotes(xml: string | undefined, tag: "footnote" | "endnote"): boolean {
  if (!xml) return false;
  const re = new RegExp(`<w:${tag}\\b([^>]*)>`, "g");
  for (const [, attrs] of xml.matchAll(re)) {
    if (/w:type="(separator|continuationSeparator|continuationNotice)"/.test(attrs)) continue;
    return true;
  }
  return false;
}

export async function inspectDocx(bytes: Uint8Array): Promise<DocxLoss[]> {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files);
  const read = (name: string) => zip.file(name)?.async("string");
  const body = (await read("word/document.xml")) ?? "";
  const found = new Set<DocxLoss>();

  if (names.some((n) => /^word\/(header|footer)\d*\.xml$/.test(n))) {
    found.add("headers-footers");
  }
  if (/<w:comment\b/.test((await read("word/comments.xml")) ?? "") ||
      /<w:commentReference\b/.test(body)) {
    found.add("comments");
  }
  if (/<w:(ins|del|moveFrom|moveTo)\b/.test(body)) found.add("tracked-changes");
  if (hasRealNotes(await read("word/footnotes.xml"), "footnote") ||
      hasRealNotes(await read("word/endnotes.xml"), "endnote")) {
    found.add("footnotes");
  }
  if (/<w:(fldSimple|fldChar)\b/.test(body)) found.add("fields");
  if (/<w:txbxContent\b|<wps:wsp\b/.test(body)) found.add("text-boxes");
  if (/<w:object\b|<c:chart\b|<dgm:relIds\b/.test(body)) found.add("embedded-objects");
  // One trailing sectPr is the document's own page setup and every file has
  // it; a second means the author split the document into sections.
  const sections = body.match(/<w:sectPr\b/g)?.length ?? 0;
  if (sections > 1 || /<w:cols\b[^>]*w:num="[2-9]/.test(body)) found.add("sections");
  // Direct formatting in the body. Style-level fonts are not counted: the
  // editor's own styling replaces those wholesale, which is expected.
  // Each property block is tested on its own, so a match can never run from
  // one element's properties into the next element's.
  const rPr = body.match(/<w:rPr>[\s\S]*?<\/w:rPr>/g) ?? [];
  const pPr = body.match(/<w:pPr>[\s\S]*?<\/w:pPr>/g) ?? [];
  if (rPr.some((b) => /<w:(rFonts|sz|color)\b/.test(b))) {
    found.add("character-formatting");
  }
  if (pPr.some((b) => /<w:(jc|ind|spacing)\b/.test(b))) {
    found.add("paragraph-layout");
  }
  return [...found];
}
