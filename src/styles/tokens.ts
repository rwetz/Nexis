// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Runtime resolution of shadcn CSS custom properties into concrete rgb strings.
 *
 * globals.css declares tokens in oklch(), which xterm.js (WebGL) and
 * CodeMirror's static theme builder can't consume directly. We resolve each
 * token through the browser: setting `color: var(--x)` on a detached element
 * forces computation into rgb form, which both consumers accept.
 *
 * Tokens are read once per call. Callers that need to react to theme changes
 * (light/dark toggle) should re-invoke and rebuild their theme object.
 */

// ---------------------------------------------------------------------------
// Terminal-specific token resolution
// ---------------------------------------------------------------------------

export type TerminalTokens = {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selection: string;
  ansiBlack: string;
  ansiRed: string;
  ansiGreen: string;
  ansiYellow: string;
  ansiBlue: string;
  ansiMagenta: string;
  ansiCyan: string;
  ansiWhite: string;
  ansiBrightBlack: string;
  ansiBrightRed: string;
  ansiBrightGreen: string;
  ansiBrightYellow: string;
  ansiBrightBlue: string;
  ansiBrightMagenta: string;
  ansiBrightCyan: string;
  ansiBrightWhite: string;
};

const TERMINAL_VAR_BY_KEY: Record<keyof TerminalTokens, string> = {
  background: "--terminal-background",
  foreground: "--terminal-foreground",
  cursor: "--terminal-cursor",
  cursorAccent: "--terminal-cursor-accent",
  selection: "--terminal-selection",
  ansiBlack: "--terminal-ansi-black",
  ansiRed: "--terminal-ansi-red",
  ansiGreen: "--terminal-ansi-green",
  ansiYellow: "--terminal-ansi-yellow",
  ansiBlue: "--terminal-ansi-blue",
  ansiMagenta: "--terminal-ansi-magenta",
  ansiCyan: "--terminal-ansi-cyan",
  ansiWhite: "--terminal-ansi-white",
  ansiBrightBlack: "--terminal-ansi-bright-black",
  ansiBrightRed: "--terminal-ansi-bright-red",
  ansiBrightGreen: "--terminal-ansi-bright-green",
  ansiBrightYellow: "--terminal-ansi-bright-yellow",
  ansiBrightBlue: "--terminal-ansi-bright-blue",
  ansiBrightMagenta: "--terminal-ansi-bright-magenta",
  ansiBrightCyan: "--terminal-ansi-bright-cyan",
  ansiBrightWhite: "--terminal-ansi-bright-white",
};

const TERMINAL_KEYS = Object.keys(TERMINAL_VAR_BY_KEY) as (keyof TerminalTokens)[];

let terminalProbe: HTMLDivElement | null = null;
let colorCanvas: HTMLCanvasElement | null = null;

function getTerminalProbe(): HTMLDivElement {
  if (terminalProbe && terminalProbe.isConnected) return terminalProbe;
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText =
    "position:absolute;visibility:hidden;pointer-events:none;contain:strict;width:0;height:0;";
  document.body.appendChild(el);
  terminalProbe = el;
  return el;
}

function resolveTerminal(el: HTMLDivElement, varName: string): string {
  el.style.color = `var(${varName})`;
  return normalizeCssColor(getComputedStyle(el).color);
}

/**
 * Read a CSS Color 4 value back as sRGB pixels.
 *
 * WebKit preserves `oklch()` in `getComputedStyle(...).color`; treating its
 * three numeric components as RGB turns a neutral dark background such as
 * `oklch(0.148 0.004 228.8)` into vivid blue. Canvas pixel data is always
 * sRGB, even when CSS serialization is not.
 */
function normalizeCssColor(value: string): string {
  if (!value || typeof document === "undefined") return value;
  const canvas = colorCanvas ?? document.createElement("canvas");
  colorCanvas = canvas;
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return value;

  const sentinel = "#010203";
  ctx.fillStyle = sentinel;
  ctx.fillStyle = value;
  if (ctx.fillStyle === sentinel && value.toLowerCase() !== sentinel) return value;

  ctx.clearRect(0, 0, 1, 1);
  ctx.fillRect(0, 0, 1, 1);
  try {
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (a === 0) return value;
    return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a / 255})`;
  } catch {
    return value;
  }
}

/**
 * Resolve any CSS colour expression to concrete `rgb(...)` / `rgba(...)`.
 *
 * Canvas cannot read custom properties, and it cannot evaluate `oklch()`
 * either, so a canvas-backed view has to ask the document what a colour
 * actually is. Pass a full expression, not a bare variable name:
 * `resolveCssColor("var(--brand)")` or `resolveCssColor("oklch(0.7 0.1 40)")`.
 *
 * Reuses the same hidden probe element as the terminal tokens above rather
 * than creating a second one -- it is already attached, already `contain:
 * strict`, and one probe means one place where a stale document reference has
 * to be handled.
 *
 * Call this *after* a theme change has landed on the document, not during the
 * render that requests it: the value is whatever the current variables say.
 */
export function resolveCssColor(expr: string): string {
  const el = getTerminalProbe();
  el.style.color = "";
  el.style.color = expr;
  return normalizeCssColor(getComputedStyle(el).color);
}

export function readTerminalTokens(): TerminalTokens {
  const el = getTerminalProbe();
  const out = {} as TerminalTokens;
  for (const k of TERMINAL_KEYS) {
    out[k] = resolveTerminal(el, TERMINAL_VAR_BY_KEY[k]);
  }
  return out;
}
