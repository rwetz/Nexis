import { describe, expect, it } from "vitest";
import { PRESETS } from "@/lib/packs";
import { isPermanentToolView, visiblePermanentTools } from "./permanentTools";

describe("permanent titlebar tools", () => {
  it("promotes SVG Studio for the Art and Everything configurations", () => {
    expect(visiblePermanentTools(PRESETS.art.packs).map((tool) => tool.id)).toEqual([
      "svg-playground",
    ]);
    expect(
      visiblePermanentTools(PRESETS.everything.packs).map((tool) => tool.id),
    ).toEqual(["svg-playground"]);
  });

  it("does not promote SVG Studio for configurations without the Art pack", () => {
    expect(visiblePermanentTools(PRESETS.standard.packs)).toEqual([]);
    expect(isPermanentToolView("svg-playground", PRESETS.art.packs)).toBe(true);
    expect(
      isPermanentToolView("svg-playground", PRESETS.standard.packs),
    ).toBe(false);
  });
});
