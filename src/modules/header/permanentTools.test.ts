import { describe, expect, it } from "vitest";
import { PRESETS } from "@/lib/packs";
import { isPermanentToolView, visiblePermanentTools } from "./permanentTools";

describe("permanent titlebar tools", () => {
  it("promotes SVG Studio for Art and both workbenches for Everything", () => {
    expect(visiblePermanentTools(PRESETS.art.packs).map((tool) => tool.id)).toEqual([
      "svg-playground",
    ]);
    expect(
      visiblePermanentTools(PRESETS.everything.packs).map((tool) => tool.id),
    ).toEqual(["svg-playground", "ml-lab"]);
  });

  it("does not promote SVG Studio for configurations without the Art pack", () => {
    expect(visiblePermanentTools(PRESETS.standard.packs)).toEqual([]);
    expect(isPermanentToolView("svg-playground", PRESETS.art.packs)).toBe(true);
    expect(
      isPermanentToolView("svg-playground", PRESETS.standard.packs),
    ).toBe(false);
  });

  it("promotes ML Lab for AI / ML and keeps its sidebar view out of the rail", () => {
    expect(visiblePermanentTools(PRESETS["ai-ml"].packs).map((tool) => tool.id)).toEqual([
      "ml-lab",
    ]);
    expect(isPermanentToolView("ml", PRESETS["ai-ml"].packs)).toBe(true);
    expect(isPermanentToolView("ml", PRESETS.standard.packs)).toBe(false);
  });
});
