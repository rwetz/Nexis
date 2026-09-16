import { expect, it, vi } from "vitest";
import type { CapabilityContext } from "@/workbench/capability";
import { terminalCapability } from ".";

it("owns the AI command-search palette entry", async () => {
  const requestAiCommand = vi.fn();
  const commands = terminalCapability.commands?.(
    () => ({ terminal: { requestAiCommand } }) as unknown as CapabilityContext,
  );
  expect(commands?.map((command) => command.id)).toEqual([
    "terminal.aiCommand",
  ]);
  await commands?.[0].handler();
  expect(requestAiCommand).toHaveBeenCalledTimes(1);
});
