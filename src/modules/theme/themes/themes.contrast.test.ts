// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import { getFolderColor } from "../folderColor";
import type { Theme, ThemeMode } from "../types";
import {
  getBuiltinTheme,
  listBuiltinThemes,
  listCommunityThemes,
  listNexisThemes,
  migrateThemeId,
} from ".";

// ─── WCAG 2.1 relative luminance / contrast ──────────────────────────────────

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The floors the Nexis set is generated against — kept in sync with
 * `scripts/generate-theme-palettes.py`, which refuses to emit a palette that
 * breaks them. A hand-edit to a committed `.ts` bypasses that script, which is
 * exactly what this test is here to catch. Dropping below any of these makes
 * something unreadable somewhere in the app, so it is a tripwire, not a style
 * preference — fix the colour, not the floor.
 */
const RAMP = {
  foreground: 11,
  mutedForeground: 4.5,
  primary: 4.5,
  primaryOnPrimary: 4.5,
  destructive: 4,
  foregroundOnCard: 9,
  foregroundOnSidebar: 10,
  foregroundOnMuted: 7,
  ansiNormal: 4,
  ansiWhite: 4.5,
  ansiBrightWhite: 7,
  ansiDim: 2.6,
} as const;

const MODES: ThemeMode[] = ["dark", "light"];

function variantOf(theme: Theme, mode: ThemeMode) {
  return theme.variants[mode];
}

describe("Nexis theme set — contrast ramp", () => {
  const nexis = listNexisThemes().filter((t) => t.id !== "nexis-default");

  it("ships sixteen themes plus the default", () => {
    expect(listNexisThemes()).toHaveLength(17);
    expect(listNexisThemes()[0].id).toBe("nexis-default");
  });

  it.each(nexis.flatMap((t) => MODES.map((m) => [t.id, m, t] as const)))(
    "%s/%s meets every ramp floor",
    (_id, mode, theme) => {
      const v = variantOf(theme, mode);
      expect(v, `${theme.id} is missing its ${mode} variant`).toBeDefined();
      const c = v?.colors;
      const t = v?.terminal;
      expect(c).toBeDefined();
      expect(t?.ansi).toBeDefined();
      if (!c || !t?.ansi) return;

      const bg = c.background as string;
      const fg = c.foreground as string;

      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(RAMP.foreground);
      expect(contrast(c.mutedForeground as string, bg))
        .toBeGreaterThanOrEqual(RAMP.mutedForeground);
      expect(contrast(c.primary as string, bg))
        .toBeGreaterThanOrEqual(RAMP.primary);
      expect(contrast(c.primaryForeground as string, c.primary as string))
        .toBeGreaterThanOrEqual(RAMP.primaryOnPrimary);
      expect(contrast(c.destructive as string, bg))
        .toBeGreaterThanOrEqual(RAMP.destructive);
      expect(contrast(fg, c.card as string))
        .toBeGreaterThanOrEqual(RAMP.foregroundOnCard);
      expect(contrast(fg, c.sidebar as string))
        .toBeGreaterThanOrEqual(RAMP.foregroundOnSidebar);
      expect(contrast(fg, c.muted as string))
        .toBeGreaterThanOrEqual(RAMP.foregroundOnMuted);

      // Terminal ANSI: every colour a program actually prints text in.
      const ansi = t.ansi;
      for (const i of [1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14]) {
        expect(contrast(ansi[i], bg), `ansi[${i}]`)
          .toBeGreaterThanOrEqual(RAMP.ansiNormal);
      }
      expect(contrast(ansi[7], bg)).toBeGreaterThanOrEqual(RAMP.ansiWhite);
      expect(contrast(ansi[15], bg)).toBeGreaterThanOrEqual(RAMP.ansiBrightWhite);
      // ansi[8] is the conventional comment/dim grey — readable, not prominent.
      expect(contrast(ansi[8], bg)).toBeGreaterThanOrEqual(RAMP.ansiDim);
    },
  );

  it("keeps the ramp identical across the set (same L, different hue)", () => {
    // Every Nexis theme is cut from one ramp, so foreground-on-background
    // contrast should land in a tight band rather than drifting per theme.
    for (const mode of MODES) {
      const ratios = nexis.map((t) => {
        const c = variantOf(t, mode)?.colors;
        return contrast(c?.foreground as string, c?.background as string);
      });
      const spread = Math.max(...ratios) - Math.min(...ratios);
      expect(spread, `${mode} spread ${spread.toFixed(2)}`).toBeLessThan(2.5);
    }
  });

  it("gives every Nexis theme a distinct accent", () => {
    const accents = nexis.map((t) => variantOf(t, "dark")?.colors?.primary);
    expect(new Set(accents).size).toBe(accents.length);
  });
});

describe("community themes", () => {
  it("are all credited to their author", () => {
    for (const t of listCommunityThemes()) {
      expect(t.author, `${t.id} has no author`).toBeTruthy();
    }
  });

  // These are held to WCAG AA (4.5), not the Nexis ramp's 11. They are their
  // authors' palettes and we ship them as designed — Rosé Pine Dawn, for one,
  // sits at ~6.7 by intent. AA is the floor below which we would not ship a
  // palette at all; above it, the author's call stands.
  it("stay readable even though they don't follow the Nexis ramp", () => {
    for (const t of listCommunityThemes()) {
      for (const mode of MODES) {
        const c = variantOf(t, mode)?.colors;
        if (!c?.background || !c.foreground) continue;
        expect(contrast(c.foreground, c.background), `${t.id}/${mode}`)
          .toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("theme registry", () => {
  it("has a folder colour for every builtin theme", () => {
    for (const t of listBuiltinThemes()) {
      for (const mode of MODES) {
        // getFolderColor falls back to nexis-default; assert the entry is real.
        const fallback = getFolderColor("nexis-default", mode);
        const got = getFolderColor(t.id, mode);
        if (t.id !== "nexis-default") {
          expect(got, `${t.id}/${mode} falls through to the default`)
            .not.toBe(fallback);
        }
      }
    }
  });

  // Community entries deliberately diverge (Tokyo Night's `primary` is a washed
  // lavender; its folder colour is the blue) — only the Nexis set is pinned.
  it("keeps each Nexis folder colour equal to that theme's primary", () => {
    for (const t of listNexisThemes()) {
      if (t.id === "nexis-default") continue;
      for (const mode of MODES) {
        expect(getFolderColor(t.id, mode), `${t.id}/${mode}`)
          .toBe(variantOf(t, mode)?.colors?.primary);
      }
    }
  });

  it("migrates every retired theme id onto a theme that still exists", () => {
    for (const old of ["claude", "caffeine", "tide", "sage"]) {
      const next = migrateThemeId(old);
      expect(next, `${old} was not migrated`).not.toBe(old);
      expect(getBuiltinTheme(next), `${old} -> ${next} does not exist`)
        .toBeDefined();
    }
  });

  it("leaves live theme ids alone", () => {
    for (const t of listBuiltinThemes()) {
      expect(migrateThemeId(t.id)).toBe(t.id);
    }
  });
});
