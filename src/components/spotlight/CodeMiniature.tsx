// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The first lines of a code file drawn as a tiny editor window: title bar,
 * gutter, and syntax colour from the active theme's terminal palette, so the
 * miniature matches the theme the real editor would open in.
 *
 * SVG text, not HTML: it scales to any preview width as one unit, and every
 * character is rendered through React as text, so file contents can never be
 * interpreted as markup.
 */
import { memo } from "react";
import { highlightLines, previewStart, type Token, type TokenKind } from "./miniHighlight";
import type { CodeFamily } from "./previewKind";

const COLOR: Record<TokenKind, string> = {
  plain: "var(--foreground)",
  comment: "var(--muted-foreground)",
  string: "var(--terminal-ansi-green)",
  number: "var(--terminal-ansi-yellow)",
  keyword: "var(--terminal-ansi-magenta)",
  call: "var(--terminal-ansi-blue)",
  tag: "var(--terminal-ansi-red)",
};

const W = 300;
const H = 188;
const BAR = 20;
const LINE = 10.5;
const MAX_LINES = 15;
const MAX_COLS = 46;

/** Cut a token line to `cols` characters, splitting the token that crosses it. */
function clip(tokens: readonly Token[], cols: number): Token[] {
  const out: Token[] = [];
  let left = cols;
  for (const t of tokens) {
    if (left <= 0) break;
    out.push(t.text.length > left ? { ...t, text: t.text.slice(0, left) } : t);
    left -= t.text.length;
  }
  return out;
}

export const CodeMiniature = memo(function CodeMiniature({
  lines,
  family,
  fileName,
}: {
  lines: readonly string[];
  family: CodeFamily;
  fileName: string;
}) {
  const tokenLines = highlightLines(
    lines.map((l) => l.split("\t").join("  ")),
    family,
  );
  const start = previewStart(tokenLines, MAX_LINES);
  const shown = tokenLines.slice(start, start + MAX_LINES);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block size-full" role="img" aria-label={`Preview of ${fileName}`}>
      <defs>
        <linearGradient id="nx-mini-fade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0.72" stopColor="var(--card)" stopOpacity="0" />
          <stop offset="1" stopColor="var(--card)" stopOpacity="1" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="9" fill="var(--card)" stroke="var(--border)" />
      <path d={`M0.5 ${BAR} H${W - 0.5}`} stroke="var(--border)" />
      <circle cx="12" cy={BAR / 2} r="3" fill="var(--terminal-ansi-red)" />
      <circle cx="22" cy={BAR / 2} r="3" fill="var(--terminal-ansi-yellow)" />
      <circle cx="32" cy={BAR / 2} r="3" fill="var(--terminal-ansi-green)" />
      <text x={W / 2} y={BAR / 2 + 2.6} textAnchor="middle" fontSize="7.5" fill="var(--muted-foreground)" fontFamily="var(--font-sans)">
        {fileName}
      </text>
      <rect x="0.5" y={BAR} width="22" height={H - BAR - 1} fill="var(--muted)" opacity="0.5" />
      {/* xml:space="preserve": SVG collapses runs of spaces by default,
          which flattens every line's indentation to nothing. */}
      <g fontFamily="var(--font-mono)" fontSize="7.4" xmlSpace="preserve" style={{ whiteSpace: "pre" }}>
        {shown.map((tokens, i) => {
          const y = BAR + 11 + i * LINE;
          return (
            <g key={start + i}>
              <text x="17" y={y} textAnchor="end" fill="var(--muted-foreground)" opacity="0.6">
                {start + i + 1}
              </text>
              {/* Inline, on the element: a global stylesheet rule sets
                  `white-space: nowrap` on SVG text, which beats the value
                  inherited from the group and collapses indentation. */}
              <text x="28" y={y} style={{ whiteSpace: "pre" }}>
                {clip(tokens, MAX_COLS).map((t, j) => (
                  <tspan key={j} fill={COLOR[t.kind]} fontStyle={t.kind === "comment" ? "italic" : undefined}>
                    {t.text}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}
      </g>
      {lines.length > start + MAX_LINES ? (
        <rect x="1" y={BAR} width={W - 2} height={H - BAR - 1} rx="8" fill="url(#nx-mini-fade)" />
      ) : null}
    </svg>
  );
});
