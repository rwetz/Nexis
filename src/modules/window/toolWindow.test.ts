import { expect, it } from "vitest";
import type { ToolWindowContribution } from "@/workbench/capability";
import { toolWindowFromSearch } from "./toolWindow";

const tools: readonly ToolWindowContribution[] = [{
  id: "test-tool",
  label: "Test tool",
  title: "Test tool — Nexis",
  icon: "activity",
  width: 900,
  render: () => null,
}];

it("admits only declared tool-window routes", () => {
  expect(toolWindowFromSearch("?tool=test-tool", tools)).toBe(tools[0]);
  expect(toolWindowFromSearch("?tool=unknown", tools)).toBeNull();
  expect(toolWindowFromSearch("?tool=test-tool%00unknown", tools)).toBeNull();
  expect(toolWindowFromSearch("", tools)).toBeNull();
});
