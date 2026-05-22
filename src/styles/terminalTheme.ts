import { readAppTokens } from "@/styles/tokens";
import type { ITheme } from "@xterm/xterm";

/**
 * xterm.js ITheme is 18 colors: bg/fg/cursor/cursorAccent/selection + ANSI 16.
 *
 * Chrome colors (background, foreground, cursor, selection) always come from
 * the shadcn CSS tokens so the terminal visually fuses with the app. The ANSI
 * 16 palette is switchable via the terminalColorTheme preference.
 */

type AnsiPalette = {
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
};

const PALETTES: Record<string, AnsiPalette> = {
  default: {
    black: "#18181b",
    red: "#ef4444",
    green: "#22c55e",
    yellow: "#eab308",
    blue: "#3b82f6",
    magenta: "#a855f7",
    cyan: "#06b6d4",
    white: "#e4e4e7",
    brightBlack: "#52525b",
    brightRed: "#f87171",
    brightGreen: "#4ade80",
    brightYellow: "#facc15",
    brightBlue: "#60a5fa",
    brightMagenta: "#c084fc",
    brightCyan: "#22d3ee",
    brightWhite: "#fafafa",
  },
  catppuccin: {
    black: "#45475a",
    red: "#f38ba8",
    green: "#a6e3a1",
    yellow: "#f9e2af",
    blue: "#89b4fa",
    magenta: "#f5c2e7",
    cyan: "#94e2d5",
    white: "#bac2de",
    brightBlack: "#585b70",
    brightRed: "#f38ba8",
    brightGreen: "#a6e3a1",
    brightYellow: "#f9e2af",
    brightBlue: "#89b4fa",
    brightMagenta: "#f5c2e7",
    brightCyan: "#94e2d5",
    brightWhite: "#a6adc8",
  },
  dracula: {
    black: "#21222c",
    red: "#ff5555",
    green: "#50fa7b",
    yellow: "#f1fa8c",
    blue: "#bd93f9",
    magenta: "#ff79c6",
    cyan: "#8be9fd",
    white: "#f8f8f2",
    brightBlack: "#6272a4",
    brightRed: "#ff6e6e",
    brightGreen: "#69ff94",
    brightYellow: "#ffffa5",
    brightBlue: "#d6acff",
    brightMagenta: "#ff92df",
    brightCyan: "#a4ffff",
    brightWhite: "#ffffff",
  },
  nord: {
    black: "#3b4252",
    red: "#bf616a",
    green: "#a3be8c",
    yellow: "#ebcb8b",
    blue: "#81a1c1",
    magenta: "#b48ead",
    cyan: "#88c0d0",
    white: "#e5e9f0",
    brightBlack: "#4c566a",
    brightRed: "#bf616a",
    brightGreen: "#a3be8c",
    brightYellow: "#ebcb8b",
    brightBlue: "#81a1c1",
    brightMagenta: "#b48ead",
    brightCyan: "#8fbcbb",
    brightWhite: "#eceff4",
  },
  solarized: {
    black: "#073642",
    red: "#dc322f",
    green: "#859900",
    yellow: "#b58900",
    blue: "#268bd2",
    magenta: "#d33682",
    cyan: "#2aa198",
    white: "#eee8d5",
    brightBlack: "#002b36",
    brightRed: "#cb4b16",
    brightGreen: "#586e75",
    brightYellow: "#657b83",
    brightBlue: "#839496",
    brightMagenta: "#6c71c4",
    brightCyan: "#93a1a1",
    brightWhite: "#fdf6e3",
  },
  "one-dark": {
    black: "#282c34",
    red: "#e06c75",
    green: "#98c379",
    yellow: "#e5c07b",
    blue: "#61afef",
    magenta: "#c678dd",
    cyan: "#56b6c2",
    white: "#abb2bf",
    brightBlack: "#5c6370",
    brightRed: "#e06c75",
    brightGreen: "#98c379",
    brightYellow: "#e5c07b",
    brightBlue: "#61afef",
    brightMagenta: "#c678dd",
    brightCyan: "#56b6c2",
    brightWhite: "#ffffff",
  },
};

export const TERMINAL_COLOR_THEMES = [
  "default",
  "catppuccin",
  "dracula",
  "nord",
  "solarized",
  "one-dark",
] as const;

export type TerminalColorThemeId = (typeof TERMINAL_COLOR_THEMES)[number];

export const TERMINAL_COLOR_THEME_LABELS: Record<TerminalColorThemeId, string> = {
  default: "Default Dark",
  catppuccin: "Catppuccin Mocha",
  dracula: "Dracula",
  nord: "Nord",
  solarized: "Solarized Dark",
  "one-dark": "One Dark",
};

/** Semantic palette reused by the code editor. */
export const syntaxPalette = {
  comment: PALETTES.default.brightBlack,
  keyword: PALETTES.default.blue,
  string: PALETTES.default.green,
  number: PALETTES.default.yellow,
  constant: PALETTES.default.magenta,
  fn: PALETTES.default.cyan,
  type: PALETTES.default.brightCyan,
  tag: PALETTES.default.red,
  punctuation: "#a1a1aa",
  invalid: PALETTES.default.red,
  link: PALETTES.default.blue,
} as const;

/**
 * Builds an xterm theme at runtime. Chrome colors (bg/fg/cursor/selection)
 * always derive from CSS tokens; ANSI 16 uses the selected named palette.
 * Must be called after the DOM is ready.
 */
export function buildTerminalTheme(colorTheme?: string): ITheme {
  const t = readAppTokens();
  const palette = PALETTES[colorTheme ?? "default"] ?? PALETTES.default;
  return {
    background: t.background,
    foreground: t.foreground,
    cursor: t.foreground,
    cursorAccent: t.background,
    selectionBackground: t.accent,
    ...palette,
  };
}
