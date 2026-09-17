import { describe, expect, it } from "vitest";
import { databaseCapability } from "./database";
import { debuggerCapability } from "./debugger";
import { mlCapability } from "./ml";
import { portsCapability } from "./ports";
import { shareCapability } from "./share";
import { sshCapability } from "./ssh";
import { webToolsCapability } from "./web-tools";

describe("integration capability panels", () => {
  it("owns every migrated legacy sidebar route", () => {
    const definitions = [
      debuggerCapability,
      databaseCapability,
      portsCapability,
      sshCapability,
      webToolsCapability,
      shareCapability,
      mlCapability,
    ];

    const panels = definitions.flatMap((definition) => definition.panels);
    expect(panels.map((panel) => panel.legacyView)).toEqual(expect.arrayContaining([
      "debugger",
      "database",
      "ports",
      "ssh",
      "http-client",
      "share",
      "ml",
    ]));
    expect(
      panels
        .filter((panel) => panel.legacyView !== "web-tools")
        .every((panel) => panel.showInRail === false),
    ).toBe(true);
    expect(panels.every((panel) => panel.lifecycle === "unmount")).toBe(true);
  });
});
