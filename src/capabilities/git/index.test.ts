import { expect, it, vi } from "vitest";
import type { CapabilityContext } from "@/workbench/capability";
import { gitCapability } from "./index";

it("owns the legacy source-control view and activation command", async () => {
  const panel = gitCapability.panels[0];
  expect(panel).toMatchObject({
    id: "git:source-control",
    legacyView: "source-control",
    lifecycle: "unmount",
    showInRail: false,
  });

  const activate = vi.fn();
  const commands = gitCapability.commands?.(() => ({
    panels: { activate },
  }) as unknown as CapabilityContext);
  await commands?.[0]?.handler();
  expect(activate).toHaveBeenCalledWith("git:source-control");
});
