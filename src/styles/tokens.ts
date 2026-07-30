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
  return getComputedStyle(el).color;
}

export function readTerminalTokens(): TerminalTokens {
  const el = getTerminalProbe();
  const out = {} as TerminalTokens;
  for (const k of TERMINAL_KEYS) {
    out[k] = resolveTerminal(el, TERMINAL_VAR_BY_KEY[k]);
  }
  return out;
}
