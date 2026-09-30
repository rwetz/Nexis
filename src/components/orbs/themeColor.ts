// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { resolveThemeToken } from "@/modules/art/lib/themePalette";
import type { OrbVariant } from "./types";

const THEME_REF = /^theme:(--[\w-]+)\|(#[0-9a-fA-F]{6})$/;

/**
 * `#rrggbb` as is; `theme:--token|#fallback` through the active theme. The
 * theme's value goes through the same one-pixel canvas the Palette panel
 * uses, because a theme may write any CSS colour syntax (oklch and so on).
 */
export function resolveOrbColor(value: string, resolve = resolveThemeToken): string {
  const m = THEME_REF.exec(value);
  if (!m) return value;
  return resolve(m[1]) ?? m[2];
}

export function baseColorsFor(variant: OrbVariant, resolve = resolveThemeToken): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of variant.colors) out[c.key] = resolveOrbColor(c.default, resolve);
  return out;
}
