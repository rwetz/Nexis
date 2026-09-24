import type { Theme } from "./types";
import { resolveCssColor } from "@/styles/tokens";

export type LumenPaletteExchange = {
  format: "nexis-lumen-palette" | "nexis-lumen-scene";
  version: 1;
  palette: { name: string; colors: string[] };
};

const HEX = /^#[0-9a-fA-F]{6}$/;

export function exportLumenPalette(name: string): LumenPaletteExchange {
  const color = (token: string): string => {
    const rgb = resolveCssColor(`var(--${token})`);
    const match = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(rgb);
    if (!match) throw new Error(`Could not resolve ${token} to an opaque color`);
    return `#${match.slice(1).map((part) => Number(part).toString(16).padStart(2, "0")).join("")}`;
  };
  return {
    format: "nexis-lumen-palette",
    version: 1,
    palette: { name, colors: ["background", "primary", "secondary", "muted", "foreground"].map(color) },
  };
}

export function importLumenPalette(raw: unknown): Theme {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("Exchange must be an object");
  const data = raw as Partial<LumenPaletteExchange>;
  if ((data.format !== "nexis-lumen-palette" && data.format !== "nexis-lumen-scene") || data.version !== 1) throw new Error("Unsupported Lumen exchange format or version");
  const palette = data.palette;
  if (!palette || typeof palette.name !== "string" || !palette.name.trim() || palette.name.length > 80 ||
    !Array.isArray(palette.colors) || palette.colors.length < 2 || palette.colors.length > 8 ||
    !palette.colors.every((color) => typeof color === "string" && HEX.test(color))) {
    throw new Error("Palette needs a name and 2–8 six-digit hex colors");
  }
  const [background, primary] = palette.colors;
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [r, g, b] = channels.map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const foreground = luminance(background) > 0.179 ? "#000000" : "#ffffff";
  const primaryForeground = luminance(primary) > 0.179 ? "#000000" : "#ffffff";
  const mode = luminance(background) > 0.179 ? "light" : "dark";
  return {
    id: `lumen-${crypto.randomUUID()}`,
    name: `Lumen: ${palette.name.trim()}`,
    description: "Imported from a Lumen palette. Adjust text contrast in the theme editor if needed.",
    variants: { [mode]: { colors: { background, primary, primaryForeground, ring: primary, sidebar: background, foreground, sidebarForeground: foreground } } },
  };
}
