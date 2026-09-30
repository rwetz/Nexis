import { describe, expect, it } from "vitest";
import { PRESETS } from "@/lib/packs";
import { CAPABILITY_TOOL_WINDOWS } from "@/capabilities";
import { isPermanentToolView, mergeToolOrder, orderTools, visibleTools } from "./permanentTools";

const ids = (tools: readonly { id: string }[]) => tools.map((tool) => tool.id);

describe("titlebar tools", () => {
  it("shows a workbench only with its pack, and Atlas and Benchmark always", () => {
    expect(ids(visibleTools(CAPABILITY_TOOL_WINDOWS, PRESETS.standard.packs))).toEqual(["atlas", "benchmark"]);
    expect(ids(visibleTools(CAPABILITY_TOOL_WINDOWS, PRESETS.art.packs))).toEqual(["svg-studio", "atlas", "benchmark"]);
    expect(ids(visibleTools(CAPABILITY_TOOL_WINDOWS, PRESETS.everything.packs))).toEqual([
      "svg-studio", "ml-lab", "web", "documents", "atlas", "benchmark",
    ]);
  });

  it("keeps a replaced view off the rail only while its window is available", () => {
    expect(isPermanentToolView("svg-playground", PRESETS.art.packs, CAPABILITY_TOOL_WINDOWS)).toBe(true);
    expect(isPermanentToolView("svg-playground", PRESETS.standard.packs, CAPABILITY_TOOL_WINDOWS)).toBe(false);
    expect(isPermanentToolView("ml", PRESETS["ai-ml"].packs, CAPABILITY_TOOL_WINDOWS)).toBe(true);
    // Pack off: a .docx opened then lands on the sidebar's "enable this
    // pack?" placeholder instead of being healed back to Files.
    expect(isPermanentToolView("documents", PRESETS.standard.packs, CAPABILITY_TOOL_WINDOWS)).toBe(false);
    expect(isPermanentToolView("documents", ["documents"], CAPABILITY_TOOL_WINDOWS)).toBe(true);
  });
});

describe("tool order", () => {
  const tools = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

  it("applies a saved order and appends tools it has never seen", () => {
    expect(ids(orderTools(tools, ["c", "a"]))).toEqual(["c", "a", "b", "d"]);
    expect(ids(orderTools(tools, []))).toEqual(["a", "b", "c", "d"]);
    expect(ids(orderTools(tools, ["gone", "d"]))).toEqual(["d", "a", "b", "c"]);
  });

  it("remembers where a hidden tool was when the visible ones move", () => {
    // "b" is hidden (pack off) and followed "a"; the user swaps a and c.
    expect(mergeToolOrder(["a", "b", "c"], ["c", "a"])).toEqual(["c", "a", "b"]);
    // A hidden tool at the front stays at the front.
    expect(mergeToolOrder(["x", "a", "c"], ["c", "a"])).toEqual(["x", "c", "a"]);
    expect(mergeToolOrder([], ["c", "a"])).toEqual(["c", "a"]);
  });
});
