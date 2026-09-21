import { describe, expect, it } from "vitest";
import { PACK_IDS } from "@/lib/packs";
import type { PanelContribution } from "@/lib/plugins/types";
import { RAIL_VIEWS } from "@/modules/sidebar/viewCatalog";
import { bottomTabs, isBottomView, SESSION_VIEWS } from "./tabs";

const panel = (p: Partial<PanelContribution>): PanelContribution => ({
  id: "acme:log",
  title: "Log",
  location: "bottom",
  render: () => null,
  ...p,
});

describe("bottom panel routing", () => {
  it("owns every session view and nothing on the rail", () => {
    for (const id of SESSION_VIEWS) expect(isBottomView(id, []), id).toBe(true);
    for (const id of RAIL_VIEWS) expect(isBottomView(id, []), id).toBe(false);
    expect(isBottomView("snippets", [])).toBe(false);
  });

  it("owns contributed panels located at the bottom", () => {
    expect(isBottomView("plugin:acme:log", [panel({})])).toBe(true);
    expect(isBottomView("plugin:acme:log", [panel({ location: "sidebar" })])).toBe(false);
  });
});

describe("bottom panel tabs", () => {
  it("leads with Problems, then sessions in catalogue order", () => {
    const ids = bottomTabs(PACK_IDS, []).map((t) => t.id);
    expect(ids[0]).toBe("problems");
    expect(ids.slice(1)).toEqual([...SESSION_VIEWS]);
    expect(ids.slice(1, 4)).toEqual(["build", "tests", "debugger"]);
  });

  it("drops sessions whose pack is off", () => {
    const ids = bottomTabs([], []).map((t) => t.id);
    expect(ids).toContain("problems");
    expect(ids).not.toContain("build");
  });

  it("appends contributed bottom panels, pack-gated", () => {
    const tabs = bottomTabs([], [panel({}), panel({ id: "acme:gated", title: "Gated", pack: "ml-lab" })]);
    expect(tabs[tabs.length - 1]).toMatchObject({ id: "plugin:acme:log", label: "Log" });
    expect(tabs.map((t) => t.id)).not.toContain("plugin:acme:gated");
  });
});
