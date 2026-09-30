import { expect, it } from "vitest";
import type { ToolWindowContribution } from "@/workbench/capability";
import { fitToWorkArea, toolWindowFromSearch, toolWindowParamsFromSearch } from "./toolWindow";

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

it("reads launch parameters without the route", () => {
  expect(toolWindowParamsFromSearch("?tool=svg-studio&studio=palette&root=%2Fw")).toEqual({
    studio: "palette",
    root: "/w",
  });
});

it("fits a tool's size to the screen it opens on", () => {
  const tool = { width: 1360, height: 900, minWidth: 760, minHeight: 520 };
  // Plenty of room: the declared size.
  expect(fitToWorkArea(tool, { width: 2560, height: 1400 })).toEqual({
    width: 1360, height: 900, minWidth: 760, minHeight: 520,
  });
  // A 1366x728 laptop work area: shrinks inside it, minimums follow.
  const small = fitToWorkArea(tool, { width: 1366, height: 728 });
  expect(small.height).toBeLessThanOrEqual(728 * 0.9);
  expect(small.width).toBeLessThanOrEqual(1366 * 0.92);
  expect(small.minHeight).toBeLessThanOrEqual(small.height);
  // No monitor information: unchanged.
  expect(fitToWorkArea(tool, null).height).toBe(900);
});
