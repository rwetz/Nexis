// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * A deliberately small, line-at-a-time highlighter for Spotlight's code
 * miniature. It colours a thumbnail, not an editor, so it only needs to be
 * right about the tokens that give code its shape at a glance: comments,
 * strings, numbers, keywords and calls. Anything it is unsure of is plain
 * text, which is the safe mistake at this size.
 *
 * Not CodeMirror's Lezer parsers, on purpose: those are per-language lazy
 * chunks, and loading one to draw a preview the user may skip past in 50ms
 * would make the preview lag the selection.
 */
import type { CodeFamily } from "./previewKind";

export type TokenKind = "plain" | "comment" | "string" | "number" | "keyword" | "call" | "tag";
export type Token = { text: string; kind: TokenKind };

const KEYWORDS = new Set(
  (
    "abstract as async await break case catch class const continue def default defer del do elif else " +
    "enum export extends false final finally fn for from func function if impl import in interface let " +
    "loop match mod module mut new nil none null or and not package private protected pub public " +
    "raise return self static struct super switch this throw trait true try type typeof use var " +
    "void where while with yield None True False select insert update delete create table join on " +
    "local then end begin elsif unless until when record"
  ).split(" "),
);

const LINE_COMMENT: Record<CodeFamily, string> = { c: "//", hash: "#", sql: "--", markup: "" };
const QUOTES = new Set(['"', "'", "`"]);

export function highlightLine(line: string, family: CodeFamily): Token[] {
  const out: Token[] = [];
  const push = (text: string, kind: TokenKind) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text;
    else out.push({ text, kind });
  };
  const comment = LINE_COMMENT[family];
  let i = 0;
  while (i < line.length) {
    const rest = line.slice(i);
    if (comment && rest.startsWith(comment)) {
      push(rest, "comment");
      break;
    }
    if (family === "c" && rest.startsWith("/*")) {
      const end = rest.indexOf("*/", 2);
      const text = end === -1 ? rest : rest.slice(0, end + 2);
      push(text, "comment");
      i += text.length;
      continue;
    }
    if (family === "markup" && rest.startsWith("<!--")) {
      push(rest, "comment");
      break;
    }
    const ch = line[i];
    if (family === "markup" && ch === "<") {
      const tag = /^<\/?[\w:-]+/.exec(rest);
      if (tag) {
        push(tag[0], "tag");
        i += tag[0].length;
        continue;
      }
    }
    if (QUOTES.has(ch)) {
      let j = i + 1;
      while (j < line.length && line[j] !== ch) j += line[j] === "\\" ? 2 : 1;
      const text = line.slice(i, Math.min(j + 1, line.length));
      push(text, "string");
      i += text.length;
      continue;
    }
    const num = /^(0x[\da-fA-F_]+|\d[\d_]*(\.\d+)?([eE][+-]?\d+)?)/.exec(rest);
    if (num && (i === 0 || !/[\w$]/.test(line[i - 1]))) {
      push(num[0], "number");
      i += num[0].length;
      continue;
    }
    const word = /^[A-Za-z_$][\w$]*/.exec(rest);
    if (word) {
      const w = word[0];
      const next = line.slice(i + w.length).trimStart()[0];
      push(w, KEYWORDS.has(w) ? "keyword" : next === "(" ? "call" : "plain");
      i += w.length;
      continue;
    }
    push(ch, "plain");
    i += 1;
  }
  return out;
}

/**
 * Highlight consecutive lines, carrying block-comment state from one line to
 * the next. Line by line alone, the middle of a doc comment reads as code and
 * its words light up as keywords.
 */
export function highlightLines(lines: readonly string[], family: CodeFamily): Token[][] {
  let inBlock = false;
  return lines.map((line) => {
    if (family !== "c") return highlightLine(line, family);
    if (inBlock) {
      const end = line.indexOf("*/");
      if (end === -1) return line ? [{ text: line, kind: "comment" as const }] : [];
      inBlock = false;
      const head: Token = { text: line.slice(0, end + 2), kind: "comment" };
      return [head, ...highlightLine(line.slice(end + 2), family)];
    }
    const tokens = highlightLine(line, family);
    const last = tokens[tokens.length - 1];
    if (last?.kind === "comment" && last.text.startsWith("/*") && !last.text.endsWith("*/")) inBlock = true;
    return tokens;
  });
}

/**
 * Where a preview should start. A file whose first screen is nothing but a
 * header comment previews as that comment, which says little about it; skip
 * to one line before the first code line in that case.
 */
export function previewStart(tokenLines: readonly Token[][], screen: number): number {
  const isCode = (t: Token[]) => t.some((tok) => tok.kind !== "comment" && tok.text.trim() !== "");
  const first = tokenLines.findIndex(isCode);
  if (first === -1 || first < screen - 3) return 0;
  return Math.max(0, first - 1);
}
