// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * `.docx` in and out of the rich editor.
 *
 * In: mammoth turns the document body into HTML, which the editor parses
 * through its own schema. That parse is also the sanitizer: a node or
 * attribute the schema does not model (a script, an event handler, a
 * `javascript:` link, which `isAllowedHref` refuses) does not survive it.
 *
 * Out: a new document is built from the editor's JSON with the `docx`
 * package. It is not a patch of the original file, which is why
 * `inspectDocx` exists and why the first save of an imported file offers a
 * copy. The mapper covers every node in `documentExtensions`; anything else
 * degrades to its plain text rather than disappearing.
 */
import type { JSONContent } from "@tiptap/core";
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from "docx";
import { isAllowedHref } from "./extensions";

// ── Import ─────────────────────────────────────────────────────────────────

export type DocxImport = {
  html: string;
  /** mammoth's own conversion messages, de-duplicated. */
  warnings: string[];
};

export async function docxToHtml(bytes: Uint8Array): Promise<DocxImport> {
  // Lazy: mammoth is only needed once a .docx is actually opened.
  const mammoth = (await import("mammoth")).default;
  const input =
    typeof window === "undefined"
      ? { buffer: bytes as unknown as Buffer }
      : { arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer };
  const result = await mammoth.convertToHtml(input);
  return {
    html: result.value,
    warnings: [...new Set(result.messages.map((m) => m.message))],
  };
}

// ── Export ─────────────────────────────────────────────────────────────────

const ORDERED = "nx-ordered";
const MAX_IMAGE_WIDTH = 600; // px; about the text width of a Letter/A4 page
const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;
const ALIGN = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
} as const;

/** Pixel size read from the file header, so no DOM is needed to lay out an
 *  image. Returns null for anything it cannot size. */
export function imageSize(
  b: Uint8Array,
): { type: "png" | "jpg" | "gif"; width: number; height: number } | null {
  const u32 = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { type: "png", width: u32(16), height: u32(20) };
  }
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    return { type: "gif", width: b[6] | (b[7] << 8), height: b[8] | (b[9] << 8) };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    // Walk the segments to the first start-of-frame marker.
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      const len = (b[i + 2] << 8) | b[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { type: "jpg", height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
      }
      i += 2 + len;
    }
  }
  return null;
}

function dataUriBytes(src: string): Uint8Array | null {
  const m = /^data:[^;,]+;base64,(.*)$/s.exec(src);
  if (!m) return null;
  const bin = atob(m[1]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function plainText(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(plainText).join("");
}

function runs(nodes: JSONContent[] | undefined, extra: { font?: string } = {}): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  for (const n of nodes ?? []) {
    if (n.type === "hardBreak") {
      out.push(new TextRun({ text: "", break: 1 }));
      continue;
    }
    if (n.type !== "text") {
      // An inline node the mapper does not know keeps its words.
      const text = plainText(n);
      if (text) out.push(new TextRun({ text, ...extra }));
      continue;
    }
    const marks = new Set((n.marks ?? []).map((m) => m.type));
    const link = n.marks?.find((m) => m.type === "link")?.attrs?.href as string | undefined;
    const run = new TextRun({
      text: n.text ?? "",
      bold: marks.has("bold") || undefined,
      italics: marks.has("italic") || undefined,
      underline: marks.has("underline") || link ? {} : undefined,
      strike: marks.has("strike") || undefined,
      highlight: marks.has("highlight") ? "yellow" : undefined,
      font: marks.has("code") ? "Consolas" : extra.font,
      style: link ? "Hyperlink" : undefined,
    });
    out.push(link && isAllowedHref(link) ? new ExternalHyperlink({ link, children: [run] }) : run);
  }
  return out;
}

type Block = Paragraph | Table;

type Ctx = {
  /** Next numbering instance, so each ordered list restarts at 1. */
  nextInstance: number;
};

function listItems(
  list: JSONContent,
  level: number,
  ctx: Ctx,
  instance: number | null,
): Block[] {
  const out: Block[] = [];
  for (const item of list.content ?? []) {
    const checked = item.type === "taskItem" ? (item.attrs?.checked ? "[x] " : "[ ] ") : "";
    let first = true;
    for (const child of item.content ?? []) {
      if (child.type === "paragraph" && first) {
        first = false;
        const children = runs(child.content);
        if (checked) children.unshift(new TextRun(checked));
        out.push(
          new Paragraph({
            children,
            ...(instance === null
              ? { bullet: { level } }
              : { numbering: { reference: ORDERED, level, instance } }),
          }),
        );
      } else if (child.type === "bulletList" || child.type === "taskList") {
        out.push(...listItems(child, level + 1, ctx, null));
      } else if (child.type === "orderedList") {
        out.push(...listItems(child, level + 1, ctx, ctx.nextInstance++));
      } else {
        out.push(...blocks([child], ctx));
      }
    }
  }
  return out;
}

function blocks(nodes: JSONContent[] | undefined, ctx: Ctx): Block[] {
  const out: Block[] = [];
  for (const n of nodes ?? []) {
    // Left is the default and is left unwritten: an explicit `<w:jc>` on every
    // paragraph would make inspectDocx report layout loss on a file this
    // editor wrote itself.
    const align = n.attrs?.textAlign as keyof typeof ALIGN | undefined;
    const alignment = align && align !== "left" ? ALIGN[align] : undefined;
    switch (n.type) {
      case "paragraph":
        out.push(new Paragraph({ children: runs(n.content), alignment }));
        break;
      case "heading": {
        const level = Math.min(6, Math.max(1, Number(n.attrs?.level) || 1));
        out.push(new Paragraph({ children: runs(n.content), heading: HEADINGS[level - 1], alignment }));
        break;
      }
      case "bulletList":
      case "taskList":
        out.push(...listItems(n, 0, ctx, null));
        break;
      case "orderedList":
        out.push(...listItems(n, 0, ctx, ctx.nextInstance++));
        break;
      case "blockquote":
        // Quoted paragraphs get an indent and a left rule; anything else
        // inside the quote (a list, a table) is emitted as itself.
        for (const child of n.content ?? []) {
          out.push(
            ...(child.type === "paragraph"
              ? [
                  new Paragraph({
                    children: runs(child.content),
                    indent: { left: 720 },
                    border: { left: { style: BorderStyle.SINGLE, size: 12, color: "999999", space: 8 } },
                  }),
                ]
              : blocks([child], ctx)),
          );
        }
        break;
      case "codeBlock":
        for (const line of plainText(n).split("\n")) {
          out.push(new Paragraph({ children: [new TextRun({ text: line, font: "Consolas" })] }));
        }
        break;
      case "horizontalRule":
        out.push(
          new Paragraph({
            children: [],
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 1 } },
          }),
        );
        break;
      case "image": {
        const src = String(n.attrs?.src ?? "");
        const bytes = dataUriBytes(src);
        const size = bytes && imageSize(bytes);
        const alt = n.attrs?.alt ? String(n.attrs.alt) : "";
        if (bytes && size) {
          const scale = Math.min(1, MAX_IMAGE_WIDTH / size.width);
          out.push(
            new Paragraph({
              children: [
                new ImageRun({
                  type: size.type,
                  data: bytes,
                  transformation: {
                    width: Math.round(size.width * scale),
                    height: Math.round(size.height * scale),
                  },
                  altText: alt ? { name: alt, description: alt } : undefined,
                }),
              ],
            }),
          );
        } else {
          // A linked (not embedded) image: keep the reference as text rather
          // than fetch the network during a save.
          out.push(new Paragraph({ children: [new TextRun({ text: `[${alt ? `${alt}: ` : ""}${src}]`, italics: true })] }));
        }
        break;
      }
      case "table":
        out.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: (n.content ?? []).map(
              (row) =>
                new TableRow({
                  tableHeader: row.content?.every((c) => c.type === "tableHeader") || undefined,
                  children: (row.content ?? []).map((cell) => {
                    const inner = blocks(cell.content, ctx);
                    return new TableCell({
                      columnSpan: Number(cell.attrs?.colspan) > 1 ? Number(cell.attrs?.colspan) : undefined,
                      rowSpan: Number(cell.attrs?.rowspan) > 1 ? Number(cell.attrs?.rowspan) : undefined,
                      // A cell must hold at least one paragraph to be valid.
                      children: inner.length ? inner : [new Paragraph("")],
                    });
                  }),
                }),
            ),
          }),
        );
        break;
      default: {
        const text = plainText(n);
        if (text) out.push(new Paragraph({ children: [new TextRun(text)] }));
      }
    }
  }
  return out;
}

export function documentFromJson(doc: JSONContent): Document {
  const ctx: Ctx = { nextInstance: 1 };
  const children = blocks(doc.content, ctx);
  return new Document({
    numbering: {
      config: [
        {
          reference: ORDERED,
          levels: Array.from({ length: 9 }, (_, level) => ({
            level,
            format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level % 3],
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [{ children: children.length ? children : [new Paragraph("")] }],
  });
}

export async function jsonToDocx(doc: JSONContent): Promise<Uint8Array> {
  return new Uint8Array(await Packer.toArrayBuffer(documentFromJson(doc)));
}
