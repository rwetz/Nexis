import { describe, expect, it } from "vitest";
import { assertContributionId } from "@/workbench/contributions";
import type { CapabilityContext } from "@/workbench/capability";
import { CAPABILITIES, CAPABILITY_TOOL_WINDOWS } from ".";

function expectUnique(kind: string, ids: readonly string[]): void {
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  expect(duplicates, `duplicate ${kind} ids: ${duplicates.join(", ")}`).toEqual([]);
}

describe("built-in capability manifest", () => {
  it("keeps capability, panel, and command ids namespaced and unique", () => {
    const unusedContext = () => {
      throw new Error("capability manifest validation must not execute a handler");
    };
    const capabilityIds = CAPABILITIES.map((capability) => capability.id);
    const panels = CAPABILITIES.flatMap((capability) => capability.panels);
    const commands = CAPABILITIES.flatMap(
      (capability) =>
        capability.commands?.(
          unusedContext as unknown as () => CapabilityContext,
        ) ?? [],
    );

    for (const id of [
      ...capabilityIds,
      ...panels.map((panel) => panel.id),
      ...commands.map((command) => command.id),
    ]) {
      expect(() => assertContributionId(id), `${id} is not namespaced`).not.toThrow();
    }

    expectUnique("capability", capabilityIds);
    expectUnique("panel", panels.map((panel) => panel.id));
    expectUnique("command", commands.map((command) => command.id));
  });

  it("keeps persisted panel routes and companion-window ids unique", () => {
    const legacyViews = CAPABILITIES.flatMap((capability) =>
      capability.panels.flatMap((panel) =>
        panel.legacyView ? [panel.legacyView] : [],
      ),
    );
    expectUnique("legacy panel view", legacyViews);
    expectUnique(
      "capability tool window",
      CAPABILITY_TOOL_WINDOWS.map((window) => window.id),
    );
  });
});
