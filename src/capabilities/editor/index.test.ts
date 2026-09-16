import { expect, it, vi } from "vitest";
import type { CapabilityContext } from "@/workbench/capability";
import { editorCapability } from "./index";

it("owns the explorer view and activation command", async () => {
  expect(editorCapability.panels[0]).toMatchObject({
    id: "editor:explorer",
    legacyView: "explorer",
    lifecycle: "unmount",
    showInRail: false,
  });
  const activate = vi.fn();
  const commands = editorCapability.commands?.(() => ({ panels: { activate } }) as unknown as CapabilityContext);
  await commands?.[0]?.handler();
  expect(activate).toHaveBeenCalledWith("editor:explorer");
});
