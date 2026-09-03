// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import { SIDEBAR_VIEW_IDS } from "@/modules/sidebar/types";
import {
  CORE_VIEWS,
  PACK_IDS,
  PACK_PRESETS,
  PACKS,
  PRESET_IDS,
  PRESETS,
  isPresetId,
  packEnabled,
  packForView,
  unclaimedViews,
  viewEnabled,
} from "./packs";

describe("expansion packs taxonomy", () => {
  it("claims every sidebar view exactly once (or core)", () => {
    // A new sidebar view must be added to CORE_VIEWS or to one pack in
    // src/lib/packs.ts — otherwise it would silently never render for
    // anyone once gating consults the taxonomy.
    expect(unclaimedViews()).toEqual([]);

    const seen = new Map<string, string[]>();
    for (const pack of Object.values(PACKS)) {
      for (const view of pack.views) {
        seen.set(view, [...(seen.get(view) ?? []), pack.id]);
      }
    }
    const claimedTwice = [...seen.entries()].filter(([, p]) => p.length > 1);
    expect(claimedTwice).toEqual([]);

    const coreAndPacked = CORE_VIEWS.filter((v) => seen.has(v));
    expect(coreAndPacked).toEqual([]);
  });

  it("only references real sidebar view ids", () => {
    const valid = new Set<string>(SIDEBAR_VIEW_IDS);
    for (const pack of Object.values(PACKS)) {
      for (const view of pack.views) expect(valid).toContain(view);
    }
    for (const view of CORE_VIEWS) expect(valid).toContain(view);
  });

  it("presets contain only known pack ids", () => {
    const valid = new Set<string>(PACK_IDS);
    for (const packs of Object.values(PACK_PRESETS)) {
      for (const id of packs) expect(valid).toContain(id);
    }
    expect(PACK_PRESETS.everything).toEqual(PACK_IDS);
  });

  it("core views are enabled regardless of pack config", () => {
    for (const view of CORE_VIEWS) {
      expect(packForView(view)).toBeNull();
      expect(viewEnabled(view, [])).toBe(true);
    }
  });

  it("packed views follow their pack's enablement", () => {
    expect(viewEnabled("ml", [])).toBe(false);
    expect(viewEnabled("ml", ["ml-lab"])).toBe(true);
    expect(viewEnabled("debugger", ["ml-lab"])).toBe(false);
    expect(viewEnabled("debugger", ["code-tools"])).toBe(true);
  });

  it("packEnabled treats ownerless features as core", () => {
    expect(packEnabled(null, [])).toBe(true);
    expect(packEnabled(undefined, [])).toBe(true);
    expect(packEnabled("dev-tools", [])).toBe(false);
    expect(packEnabled("dev-tools", ["dev-tools"])).toBe(true);
    expect(packEnabled("dev-tools", ["ml-lab"])).toBe(false);
  });

  it("every pack carries its own key and an icon name", () => {
    // The record key and the id must agree — a mismatch makes PACKS[id].id
    // point at a different pack, which reads correctly at every call site and
    // is wrong at all of them.
    for (const id of PACK_IDS) {
      expect(PACKS[id].id).toBe(id);
      expect(PACKS[id].icon).toBeTruthy();
      expect(PACKS[id].label).toBeTruthy();
      expect(PACKS[id].description).toBeTruthy();
    }
  });
});

describe("presets", () => {
  it("is a bundle over packs and nothing else", () => {
    // Presets must stay derivable from packs. If a preset ever grows state of
    // its own, onboarding stops being a function of `enabledPacks` and
    // changing the preset later in Settings can orphan it.
    for (const id of PRESET_IDS) {
      expect(PRESETS[id].id).toBe(id);
      expect(PACK_PRESETS[id]).toEqual(PRESETS[id].packs);
      for (const p of PRESETS[id].packs) expect(PACK_IDS).toContain(p);
    }
  });

  it("names no pack twice within a preset", () => {
    for (const id of PRESET_IDS) {
      const packs = PRESETS[id].packs;
      expect(new Set(packs).size).toBe(packs.length);
    }
  });

  it("carries card metadata for every preset", () => {
    for (const id of PRESET_IDS) {
      expect(PRESETS[id].label).toBeTruthy();
      expect(PRESETS[id].blurb).toBeTruthy();
      // Bespoke art, not a general-purpose glyph — see icon-art.tsx.
      expect(PRESETS[id].icon).toMatch(/^preset-/);
    }
  });

  it("spans the range from nothing to everything", () => {
    expect(PRESETS["bare-bones"].packs).toEqual([]);
    expect(PRESETS.everything.packs).toEqual(PACK_IDS);
  });

  it("gives each domain preset its own pack", () => {
    // The point of a domain preset is that it turns on the pack named after
    // it. If that link breaks, the preset is just a differently-labelled
    // Standard and the first-run choice stops meaning anything.
    expect(PRESETS["web-dev"].packs).toContain("web-dev");
    expect(PRESETS.mobile.packs).toContain("mobile");
    expect(PRESETS.art.packs).toContain("art");
  });

  it("validates preset ids", () => {
    expect(isPresetId("web-dev")).toBe(true);
    expect(isPresetId("everything")).toBe(true);
    expect(isPresetId("nope")).toBe(false);
    expect(isPresetId(undefined)).toBe(false);
    // A pack id is not a preset id, even where the two share a name.
    expect(isPresetId("dev-tools")).toBe(false);
  });
});
