// @vitest-environment jsdom
import "@/test/dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it, vi } from "vitest";
import { Icon } from "@/components/icon";
import { isContrastPref } from "@/modules/settings/store";
import { GlidingTabs } from "./gliding-tabs";

it("selects through one tablist and reports the choice", () => {
  const onChange = vi.fn();
  render(
    <GlidingTabs
      label="Request"
      tabs={[{ id: "headers", label: "Headers" }, { id: "body", label: "Body" }]}
      value="headers"
      onChange={onChange}
    />,
  );
  expect(screen.getByRole("tablist", { name: "Request" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Headers" })).toHaveAttribute("aria-selected", "true");
  fireEvent.click(screen.getByRole("tab", { name: "Body" }));
  expect(onChange).toHaveBeenCalledWith("body");
});

it("keeps the globe's drawing when active (its fill is a different shape)", () => {
  const { container: resting } = render(<Icon name="globe" />);
  const { container: active } = render(<Icon name="globe" active />);
  expect(active.innerHTML).toBe(resting.innerHTML);
  const { container: other } = render(<Icon name="grid" active />);
  const { container: otherResting } = render(<Icon name="grid" />);
  expect(other.innerHTML).not.toBe(otherResting.innerHTML);
});

it("accepts only the three contrast values", () => {
  expect(["system", "standard", "high"].every(isContrastPref)).toBe(true);
  expect(isContrastPref("max")).toBe(false);
  expect(isContrastPref(true)).toBe(false);
});

// Themes write their palette as inline custom properties on <html>; a rule
// on :root cannot beat them, so the high-contrast tokens only work declared
// on <body>. Moving them "up" would silently disable the mode under every
// theme that sets its own colours.
it("declares high-contrast tokens on body, where they beat inline theme vars", () => {
  const css = readFileSync(resolve(__dirname, "../../styles/globals.css"), "utf8");
  expect(css).toMatch(/html\[data-contrast="high"\] body \{[^}]*--muted-foreground:/);
  expect(css).not.toMatch(/html\[data-contrast="high"\]\s*\{[^}]*--[a-z-]+:/);
});
