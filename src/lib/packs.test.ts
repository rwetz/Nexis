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
});
