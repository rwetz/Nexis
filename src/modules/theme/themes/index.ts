import { DEFAULT_THEME_ID, type Theme } from "../types";
import { tokyoNight } from "./tokyo-night";

/** The default theme has no variant overrides — clearTheme() lets the
 * globals.css OKLCH tokens (and the coral --brand) show through. */
const nexisDefault: Theme = {
  id: DEFAULT_THEME_ID,
  name: "Nexis",
  description: "Neutral OKLCH grayscale with the coral brand accent.",
  variants: {},
};

export const BUILTIN_THEMES: Theme[] = [nexisDefault, tokyoNight];

export function getBuiltinTheme(id: string): Theme | undefined {
  return BUILTIN_THEMES.find((t) => t.id === id);
}

export function getDefaultTheme(): Theme {
  return nexisDefault;
}
