// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Markdown in and out of the rich editor, and the guard that keeps a save
 * from rewriting what the editor cannot represent.
 *
 * Measured against @tiptap/markdown 3.31 (see markdownFormat.test.ts), not
 * assumed: ordinary markdown round-trips byte for byte, but three constructs
 * are destroyed on save rather than preserved —
 *   - YAML frontmatter comes back as a thematic break plus an `## title: x`
 *     heading, which is worse than dropping it;
 *   - raw HTML is reduced to its text;
 *   - footnotes are escaped into literal `\[^1\]`.
 * Reference-style link definitions are rewritten inline. Meaning survives
 * that one, but it is still a rewrite of the author's text, so it is flagged
 * with the rest.
 */

export type MarkdownHazard =
  | "frontmatter"
  | "raw-html"
  | "footnotes"
  | "reference-links";

export const HAZARD_LABELS: Record<MarkdownHazard, string> = {
  frontmatter: "YAML frontmatter",
  "raw-html": "raw HTML",
  footnotes: "footnotes",
  "reference-links": "reference-style links (would be rewritten inline)",
};

/** Lines outside fenced code blocks. A `<div>` or `[^1]` inside a fence is
 *  code, which the editor preserves verbatim, so it is not a hazard. */
function proseLines(src: string): string[] {
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of src.split(/\r?\n/)) {
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (m) {
      if (fence === null) fence = m[1][0].repeat(m[1].length);
      else if (m[1].startsWith(fence)) fence = null;
      continue;
    }
    if (fence === null) out.push(line.replace(/`[^`]*`/g, ""));
  }
  return out;
}

/** A tag or a comment. `a < b` is not HTML, and neither is an autolink like
 *  `<https://x.dev>`, which is why every bracketed run is judged on its own. */
function hasRawHtml(line: string): boolean {
  if (line.includes("<!--")) return true;
  for (const [tag] of line.matchAll(/<[^<>]*>/g)) {
    if (/^<[a-z][a-z0-9+.-]*:[^<>\s]*>$/i.test(tag)) continue; // autolink
    if (/^<\/?[a-z][a-z0-9-]*(\s[^<>]*)?\/?>$/i.test(tag)) return true;
  }
  return false;
}

export function detectMarkdownHazards(src: string): MarkdownHazard[] {
  const found = new Set<MarkdownHazard>();
  if (/^---\r?\n[\s\S]*?\r?\n(---|\.\.\.)\s*(\r?\n|$)/.test(src)) {
    found.add("frontmatter");
  }
  for (const line of proseLines(src)) {
    if (hasRawHtml(line)) found.add("raw-html");
    if (/\[\^[^\]]+\]/.test(line)) found.add("footnotes");
    else if (/^\s{0,3}\[[^\]]+\]:\s*\S/.test(line)) found.add("reference-links");
  }
  return [...found];
}

/**
 * The serializer's output, normalised to how files are kept on disk: exactly
 * one trailing newline, and no run of blank lines the source did not have.
 * The table serializer opens every table with a newline of its own, so a
 * table after a paragraph came out with two blank lines above it, and a
 * table at the top with a leading one. Without this every save of an
 * untouched table would show up as a whitespace diff in git.
 *
 * Blank lines inside fenced code are content and are left exactly as they
 * are.
 */
export function normalizeMarkdownOutput(md: string): string {
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of md.split("\n")) {
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (m) {
      if (fence === null) fence = m[1][0].repeat(m[1].length);
      else if (m[1].startsWith(fence)) fence = null;
    }
    const blank = fence === null && line.trim() === "";
    if (blank && (out.length === 0 || out[out.length - 1].trim() === "")) continue;
    out.push(line);
  }
  return out.join("\n").replace(/\s*$/, "") + "\n";
}
