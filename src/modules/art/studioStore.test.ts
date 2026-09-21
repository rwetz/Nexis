import { describe, expect, it } from "vitest";
import { PACKS } from "@/lib/packs";
import { isSidebarViewId } from "@/modules/sidebar/types";
import { STUDIO_TOOL_IDS, STUDIO_TOOLS, useSvgStudioStore } from "./studioStore";

describe("SVG Studio tools", () => {
  it("lists every tool id exactly once, Draw first", () => {
    expect(STUDIO_TOOLS.map((t) => t.id)).toEqual([...STUDIO_TOOL_IDS]);
    expect(STUDIO_TOOLS[0].id).toBe("draw");
  });

  // The art tools have one home. A second one in the sidebar is the
  // "reachable four ways" drift the move existed to end.
  it("keeps the studio tools out of the sidebar", () => {
    for (const id of STUDIO_TOOL_IDS) {
      expect(isSidebarViewId(id), id).toBe(false);
    }
    expect(PACKS.art.views).toEqual(["svg-playground"]);
  });

  it("switches the tool in front", () => {
    useSvgStudioStore.getState().setTool("palette");
    expect(useSvgStudioStore.getState().tool).toBe("palette");
    useSvgStudioStore.getState().setTool("draw");
  });
});
