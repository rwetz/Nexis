import { describe, expect, it } from "vitest";
import { fragmentSource } from "./renderer";
import { baseColorsFor, resolveOrbColor } from "./themeColor";
import { ORB_STATES, SHARED_UNIFORMS } from "./types";
import { ORB_ID_LIST, isAiOrbPref } from "./ids";
import { ORB_IDS, ORB_VARIANTS } from "./variants";

const HEX = /^#[0-9a-fA-F]{6}$/;
const THEME = /^theme:--[\w-]+\|#[0-9a-fA-F]{6}$/;

describe.each(ORB_VARIANTS.map((v) => [v.key, v] as const))("orb %s", (_key, v) => {
  it("declares every uniform the drive writes, with the right type", () => {
    // The GPU half of upstream's `floatSlot` check, done statically: a
    // missing or mistyped uniform would silently read as zero.
    const src = fragmentSource(v);
    for (const p of v.params) expect(src, `p_${p.key}`).toMatch(new RegExp(`uniform float p_${p.key};`));
    for (const c of v.colors) expect(src, `c_${c.key}`).toMatch(new RegExp(`uniform vec3 c_${c.key};`));
    for (const u of SHARED_UNIFORMS) expect(src).toMatch(new RegExp(`uniform (float|vec2) ${u};`));
    expect(src).toMatch(/void main\(\)/);
    expect(src).toMatch(/fragColor\s*=/);
  });

  it("keeps defaults and presets inside each param's range", () => {
    for (const p of v.params) {
      expect(p.min).toBeLessThan(p.max);
      expect(p.default).toBeGreaterThanOrEqual(p.min);
      expect(p.default).toBeLessThanOrEqual(p.max);
    }
    const keys = new Set(v.params.map((p) => p.key));
    for (const state of ORB_STATES) {
      const preset = v.statePresets[state];
      expect(preset, `${state} preset`).toBeDefined();
      for (const [k, val] of Object.entries(preset ?? {})) {
        expect(keys.has(k), `${state}.${k} is a param`).toBe(true);
        const def = v.params.find((p) => p.key === k)!;
        expect(val).toBeGreaterThanOrEqual(def.min);
        expect(val).toBeLessThanOrEqual(def.max);
      }
    }
  });

  it("has colours that are hex or theme references with a fallback", () => {
    for (const c of v.colors) expect(c.default).toMatch(new RegExp(`${HEX.source}|${THEME.source}`));
    for (const colors of Object.values(v.stateColors ?? {})) {
      for (const hex of Object.values(colors ?? {})) expect(hex).toMatch(HEX);
    }
  });

  it("has no preprocessor directive of its own (the prelude owns #version)", () => {
    expect(v.fragment).not.toMatch(/#version|precision /);
  });
});

describe("orb registry", () => {
  it("has six distinct ids", () => {
    expect(ORB_IDS).toHaveLength(6);
    expect(new Set(ORB_IDS).size).toBe(6);
  });

  it("matches the startup-path id list exactly, in order", () => {
    expect(ORB_IDS).toEqual([...ORB_ID_LIST]);
  });

  it("validates the preference", () => {
    expect(isAiOrbPref("glass")).toBe(true);
    expect(isAiOrbPref("off")).toBe(true);
    expect(isAiOrbPref("orb-01")).toBe(false);
    expect(isAiOrbPref(3)).toBe(false);
  });
});

describe("resolveOrbColor", () => {
  it("resolves a theme token, falls back when it is missing, passes hex through", () => {
    expect(resolveOrbColor("theme:--brand|#123456", () => "#abcdef")).toBe("#abcdef");
    expect(resolveOrbColor("theme:--brand|#123456", () => null)).toBe("#123456");
    expect(resolveOrbColor("#00ff00", () => "#abcdef")).toBe("#00ff00");
  });

  it("resolves every colour of a variant", () => {
    const colors = baseColorsFor(ORB_VARIANTS[0], () => null);
    for (const hex of Object.values(colors)) expect(hex).toMatch(HEX);
  });
});
