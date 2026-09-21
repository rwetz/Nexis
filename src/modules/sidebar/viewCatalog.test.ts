import { describe, expect, it, vi } from "vitest";
import { RAIL_VIEWS, VIEW_CATALOG, viewPaletteCommands } from "./viewCatalog";
import { pluginPanelCommands } from "./pluginPanels";
import type { PanelContribution } from "@/lib/plugins/types";

describe("sidebar view catalogue", () => {
  // The rail is the contextual views and nothing else. Growing it is a
  // decision about what kind of thing a view is, made in the catalogue —
  // never a pin, and never an extra entry here to make a test pass.
  it("puts exactly the contextual views on the rail", () => {
    expect(RAIL_VIEWS).toEqual([
      "explorer",
      "source-control",
      "outline",
      "symbol-search",
      "bookmarks",
      "recent-files",
    ]);
  });

  it("gives every off-rail view without its own command a generated one", () => {
    const open = vi.fn();
    const commands = viewPaletteCommands(open);
    const ids = commands.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [id, entry] of Object.entries(VIEW_CATALOG)) {
      expect(ids.includes(`view.${id}`), id).toBe(entry.command !== false);
    }
    commands.find((c) => c.id === "view.build")!.action();
    expect(open).toHaveBeenCalledWith("build");
  });

  it("gates generated commands by the view's pack", () => {
    const build = viewPaletteCommands(() => {}).find((c) => c.id === "view.build");
    expect(build?.pack).toBe("code-tools");
  });
});

describe("contributed panel commands", () => {
  const panel = (p: Partial<PanelContribution>): PanelContribution => ({
    id: "acme:thing",
    title: "Thing",
    location: "sidebar",
    render: () => null,
    ...p,
  });

  it("reaches panels off the rail, and only those", () => {
    const open = vi.fn();
    const cmds = pluginPanelCommands(
      [
        panel({}),
        panel({ id: "acme:rail", title: "Rail", showInRail: true }),
        panel({ id: "acme:legacy", title: "Legacy", legacyView: "ports" }),
        panel({ id: "acme:gated", title: "Gated", pack: "ml-lab" }),
      ],
      [],
      open,
    );
    expect(cmds.map((c) => c.label)).toEqual(["Show Thing"]);
    cmds[0].action();
    expect(open).toHaveBeenCalledWith("plugin:acme:thing");
  });
});
