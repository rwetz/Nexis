// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import {
  PRESET_GROUPS,
  presetById,
  presetsInGroup,
  SVG_PRESETS,
} from "./presets";
import { looksLikeSvg } from "./svgExport";
import { optimizeSvg } from "./svgOptimize";
import { sanitizeSvgForPreview } from "./svgSanitize";

describe("preset registry", () => {
  it("has unique ids and a label for each", () => {
    const ids = SVG_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of SVG_PRESETS) expect(p.label).toBeTruthy();
  });

  it("puts every preset in a known group, and fills every group", () => {
    for (const p of SVG_PRESETS) {
      expect(PRESET_GROUPS).toContain(p.group);
    }
    // An empty group renders as a heading with nothing under it.
    for (const g of PRESET_GROUPS) {
      expect(presetsInGroup(g).length, `${g} is empty`).toBeGreaterThan(0);
    }
  });

  it("resolves by id", () => {
    expect(presetById("check")?.group).toBe("Marks");
    expect(presetById("nope")).toBeUndefined();
  });
});

describe("every preset's source", () => {
  /**
   * The generator-backed presets pass a parameter name to `shapeById`. A typo
   * there, or a generator that gets renamed, produces an empty string rather
   * than an error — so this is the assertion that catches it.
   */
  it("is a complete SVG document", () => {
    for (const p of SVG_PRESETS) {
      expect(p.source, `${p.id} is empty`).not.toBe("");
      expect(looksLikeSvg(p.source), `${p.id} is not a document`).toBe(true);
      expect(p.source).toContain("viewBox");
    }
  });

  it("is clean under the preview sanitizer", () => {
    // A preset that trips the guard would render differently from its source,
    // which is exactly the confusion a starting point must not introduce.
    for (const p of SVG_PRESETS) {
      const { removed } = sanitizeSvgForPreview(p.source);
      expect(removed, `${p.id} produced markup the sanitizer strips`).toEqual([]);
    }
  });

  it("survives the optimizer", () => {
    for (const p of SVG_PRESETS) {
      expect(looksLikeSvg(optimizeSvg(p.source).svg), `${p.id} broke`).toBe(true);
    }
  });

  it("uses currentColor rather than a baked-in colour", () => {
    // Art that names a hex cannot take the theme, which is the same defect
    // pitfall #18 describes for the file-tree icons.
    for (const p of SVG_PRESETS) {
      expect(p.source, `${p.id} names a literal colour`).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(p.source).toContain("currentColor");
    }
  });
});
