import { expect, it, vi } from "vitest";
import type { CapabilityContext } from "@/workbench/capability";
import { aiCapability } from ".";

it("owns the AI overlay palette command", async () => {
  const toggle = vi.fn();
  const commands = aiCapability.commands?.(
    () => ({ overlays: { toggle } }) as unknown as CapabilityContext,
  );
  expect(aiCapability.panels).toEqual([]);
  expect(commands?.map((command) => command.id)).toEqual(["ai.toggle"]);
  await commands?.[0].handler();
  expect(toggle).toHaveBeenCalledWith("ai");
});
