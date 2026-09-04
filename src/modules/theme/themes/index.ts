// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { DEFAULT_THEME_ID, type Theme } from "../types";
import { absinthe } from "./absinthe";
import { acid } from "./acid";
import { aurelian } from "./aurelian";
import { cinder } from "./cinder";
import { cyanotype } from "./cyanotype";
import { catppuccin } from "./community/catppuccin";
import { gruvbox } from "./community/gruvbox";
import { nord } from "./community/nord";
import { rosePine } from "./community/rose-pine";
import { tokyoNight } from "./community/tokyo-night";
import { glacier } from "./glacier";
import { halcyon } from "./halcyon";
import { hotwire } from "./hotwire";
import { meridian } from "./meridian";
import { nexisDefault } from "./nexis-default";
import { sulfur } from "./sulfur";
import { synthwave } from "./synthwave";
import { tangerine } from "./tangerine";
import { thicket } from "./thicket";
import { ultramarine } from "./ultramarine";
import { ultraviolet } from "./ultraviolet";
import { vermillion } from "./vermillion";

/**
 * Nexis-designed themes. Every one is generated from a single shared OKLCH
 * ramp (see `themes.contrast.test.ts` for the floors it guarantees), so the
 * set holds one contrast profile across sixteen hue families and both light
 * and dark. These are original palettes, not recolours of anything.
 *
 * Ordered quiet-first. The original six are muted, near-neutral surfaces with
 * one accent; the ten that follow turn the *surface* chroma up rather than
 * only the accent, which is what actually makes a theme loud — a saturated
 * background reads as a colour instead of as grey. They sit on the identical
 * ramp and clear the identical floors: vivid, not unreadable. The generator
 * refuses to emit a palette that drops below one, and it caught exactly that
 * while these were being cut.
 */
const NEXIS: Theme[] = [
  nexisDefault,
  halcyon,
  meridian,
  cinder,
  aurelian,
  thicket,
  vermillion,
  // The loud half.
  hotwire,
  tangerine,
  sulfur,
  acid,
  absinthe,
  cyanotype,
  glacier,
  ultramarine,
  ultraviolet,
  synthwave,
];

/**
 * Community palettes, kept as their authors defined them and credited to
 * them. They deliberately do NOT follow the Nexis ramp — recolouring them to
 * fit would defeat the point of shipping them.
 */
const COMMUNITY: Theme[] = [tokyoNight, catppuccin, nord, gruvbox, rosePine];

const BUILTIN: Theme[] = [...NEXIS, ...COMMUNITY];

const BY_ID = new Map<string, Theme>(BUILTIN.map((t) => [t.id, t]));

export function listNexisThemes(): Theme[] {
  return NEXIS;
}

export function listCommunityThemes(): Theme[] {
  return COMMUNITY;
}

export function listBuiltinThemes(): Theme[] {
  return BUILTIN;
}

export function getBuiltinTheme(id: string): Theme | undefined {
  return BY_ID.get(id);
}

/**
 * Themes retired when the inherited set was replaced by the Nexis set, mapped
 * to their closest survivor by hue. Without this a user sitting on one of the
 * removed ids silently snaps back to `nexis-default` and loses their choice.
 */
const RETIRED: Record<string, string> = {
  claude: "vermillion",
  caffeine: "aurelian",
  tide: "meridian",
  sage: "thicket",
};

export function migrateThemeId(id: string): string {
  return RETIRED[id] ?? id;
}

export function getDefaultTheme(): Theme {
  return BY_ID.get(DEFAULT_THEME_ID) ?? BUILTIN[0];
}
