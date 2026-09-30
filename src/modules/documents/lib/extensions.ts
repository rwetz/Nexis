// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The one Tiptap schema every document uses. The editor, the markdown
 * round-trip tests, and the docx/PDF mappers all read documents shaped by
 * this list, so a node added here must be handled by `docxFormat.ts` and
 * `pdfExport.ts` too (their mappers fall back to plain text for anything
 * they do not recognise rather than dropping it).
 */
import type { AnyExtension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";

/** Link targets a document may carry. Everything else (`javascript:`,
 *  `file:`, `data:`) is refused by the link extension on paste and on load. */
export const LINK_PROTOCOLS = ["http", "https", "mailto"] as const;

export function isAllowedHref(href: string): boolean {
  // Judged on the normalised value, as svgSanitize does: entity-decoded text
  // with control characters and whitespace stripped cannot smuggle a scheme.
  const normalized = href.replace(/[\u0000- \u007f]+/g, "").toLowerCase();
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(normalized)?.[1];
  if (!scheme) return true; // relative link or anchor
  return (LINK_PROTOCOLS as readonly string[]).includes(scheme);
}

export function documentExtensions(opts: { placeholder?: string } = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      link: {
        openOnClick: false,
        autolink: true,
        protocols: [...LINK_PROTOCOLS],
        isAllowedUri: (url) => isAllowedHref(url),
      },
    }),
    Markdown,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Highlight,
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    // Images arrive inline from .docx (mammoth emits data: URIs) and by URL
    // from markdown. `img-src` in the app CSP already limits what loads.
    Image.configure({ inline: false, allowBase64: true }),
    Placeholder.configure({ placeholder: opts.placeholder ?? "Start writing" }),
  ];
}
