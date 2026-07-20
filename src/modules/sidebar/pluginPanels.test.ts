// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import type { PackId } from "@/lib/packs";
import type { PanelContribution } from "@/lib/plugins/types";
import { describe, expect, it } from "vitest";
import {
  findPluginPanel,
  resolvePluginView,
  sidebarPanels,
  visiblePluginPanels,
} from "./pluginPanels";
import {
  isPluginPanelViewId,
  isSidebarView,
  isSidebarViewId,
  panelIdFromView,
  pluginPanelViewId,
} from "./types";

const panel = (
  id: string,
  extra: Partial<PanelContribution> = {},
): PanelContribution => ({
  id,
  title: id,
  location: "sidebar",
  render: () => null,
  ...extra,
});

describe("plugin view ids", () => {
  it("namespaces contributions so they cannot collide with built-ins", () => {
    const view = pluginPanelViewId("explorer");
    expect(view).toBe("plugin:explorer");
    // The critical property: a plugin claiming a built-in's name is still a
    // distinct view, so it can never shadow the real explorer.
    expect(isSidebarViewId(view)).toBe(false);
    expect(isPluginPanelViewId(view)).toBe(true);
  });

  it("round-trips a contribution id through the view id", () => {
    expect(panelIdFromView(pluginPanelViewId("py:env"))).toBe("py:env");
  });

  it("treats a built-in view as not a plugin view", () => {
    expect(panelIdFromView("explorer")).toBeNull();
    expect(isPluginPanelViewId("explorer")).toBe(false);
  });

  it("rejects a bare prefix with no contribution id", () => {
    expect(isPluginPanelViewId("plugin:")).toBe(false);
    expect(isSidebarView("plugin:")).toBe(false);
  });

  it("accepts both built-in and plugin views", () => {
    expect(isSidebarView("explorer")).toBe(true);
    expect(isSidebarView("plugin:x")).toBe(true);
    expect(isSidebarView("nonsense")).toBe(false);
    expect(isSidebarView(null)).toBe(false);
  });
});

describe("sidebarPanels", () => {
  it("ignores bottom-located contributions", () => {
    const panels = [panel("a"), panel("b", { location: "bottom" })];
    expect(sidebarPanels(panels).map((p) => p.id)).toEqual(["a"]);
  });
});

describe("findPluginPanel", () => {
  it("finds a sidebar contribution by its view id", () => {
    const panels = [panel("a"), panel("b")];
    expect(findPluginPanel("plugin:b", panels)?.id).toBe("b");
  });

  it("does not match a bottom panel that happens to share the id", () => {
    const panels = [panel("a", { location: "bottom" })];
    expect(findPluginPanel("plugin:a", panels)).toBeNull();
  });

  it("returns null for built-in views", () => {
    expect(findPluginPanel("explorer", [panel("explorer")])).toBeNull();
  });
});

describe("resolvePluginView", () => {
  const packs: PackId[] = ["dev-tools"];

  it("reports a registered, ungated panel as ready", () => {
    const panels = [panel("a")];
    expect(resolvePluginView("plugin:a", panels, packs)).toEqual({
      kind: "ready",
      panel: panels[0],
    });
  });

  it("reports a panel whose pack is enabled as ready", () => {
    const panels = [panel("a", { pack: "dev-tools" })];
    expect(resolvePluginView("plugin:a", panels, packs).kind).toBe("ready");
  });

  it("reports a panel whose pack is disabled as gated", () => {
    const panels = [panel("a", { pack: "ml-lab" })];
    const state = resolvePluginView("plugin:a", panels, packs);
    expect(state.kind).toBe("gated");
    expect(state.kind === "gated" && state.pack).toBe("ml-lab");
  });

  it("reports an unregistered view as missing rather than erroring", () => {
    // This is the launch-ordering case: sidebar state restores from
    // localStorage before any plugin has registered its panels.
    expect(resolvePluginView("plugin:not-yet", [], packs)).toEqual({
      kind: "missing",
    });
  });
});

describe("visiblePluginPanels", () => {
  it("hides panels whose pack is off and keeps core ones", () => {
    const panels = [
      panel("core"),
      panel("dev", { pack: "dev-tools" }),
      panel("ml", { pack: "ml-lab" }),
    ];
    expect(
      visiblePluginPanels(panels, ["dev-tools"]).map((p) => p.id),
    ).toEqual(["core", "dev"]);
  });

  it("sorts by order, then title for a stable rail", () => {
    const panels = [
      panel("z", { order: 1 }),
      panel("b", { order: 0 }),
      panel("a", { order: 0 }),
    ];
    expect(visiblePluginPanels(panels, []).map((p) => p.id)).toEqual([
      "a",
      "b",
      "z",
    ]);
  });

  it("treats a missing order as 0", () => {
    const panels = [panel("late", { order: 5 }), panel("default")];
    expect(visiblePluginPanels(panels, []).map((p) => p.id)).toEqual([
      "default",
      "late",
    ]);
  });

  it("excludes bottom panels from the rail", () => {
    const panels = [panel("side"), panel("bottom", { location: "bottom" })];
    expect(visiblePluginPanels(panels, []).map((p) => p.id)).toEqual(["side"]);
  });
});
