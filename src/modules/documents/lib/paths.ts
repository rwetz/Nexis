// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import type { DocumentFormat } from "@/modules/tabs";

/** The format a path opens as in the rich editor, or null if it doesn't. */
export function documentFormatFor(path: string): DocumentFormat | null {
  if (/\.docx$/i.test(path)) return "docx";
  if (/\.(md|markdown)$/i.test(path)) return "markdown";
  return null;
}

/** Splits at the last path separator of either kind, so WSL and Windows
 *  paths both work without knowing which one this is. */
function splitDir(path: string): [string, string] {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i < 0 ? ["", path] : [path.slice(0, i + 1), path.slice(i + 1)];
}

/**
 * `report.docx` → `report (edited).docx`, then `(edited 2)`, `(edited 3)`…
 * until `exists` says a name is free. Never returns `path` itself: the whole
 * point of a copy is that the original is not touched.
 */
export async function copyPathFor(
  path: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const [dir, name] = splitDir(path);
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 1; n < 1000; n++) {
    const candidate = `${dir}${stem} (edited${n === 1 ? "" : ` ${n}`})${ext}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error(`No free name for a copy of ${name}`);
}

/** A new file's path in `dir`: `Untitled.md`, then `Untitled 2.md`… */
export async function newDocumentPath(
  dir: string,
  format: DocumentFormat,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  const base = dir.endsWith("/") || dir.endsWith("\\") ? dir : dir + sep;
  const ext = format === "docx" ? ".docx" : ".md";
  for (let n = 1; n < 1000; n++) {
    const candidate = `${base}Untitled${n === 1 ? "" : ` ${n}`}${ext}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error("No free name for a new document");
}

/** Same directory and stem, with a `.pdf` extension. */
export function pdfPathFor(path: string): string {
  const [dir, name] = splitDir(path);
  const dot = name.lastIndexOf(".");
  return `${dir}${dot > 0 ? name.slice(0, dot) : name}.pdf`;
}
