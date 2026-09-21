// @vitest-environment jsdom
import "@/test/dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import type { Tab } from "@/modules/tabs/lib/tabTypes";
import { useSvgStudioStore } from "./studioStore";
import { SvgPlaygroundStack } from "./SvgPlaygroundStack";

// The panels are exercised by their own lib tests; here only the Studio's
// switching matters, so each is a marker. Draw carries a counter so the test
// can tell a hidden-but-mounted playground from a remounted one.
vi.mock("./SvgPlayground", () => ({
  SvgPlayground: () => {
    const [n, setN] = useState(0);
    return <button onClick={() => setN(n + 1)}>Draw {n}</button>;
  },
}));
vi.mock("./PalettePanel", () => ({ PalettePanel: () => <p>palette panel</p> }));
vi.mock("./BackdropPanel", () => ({ BackdropPanel: () => <p>backdrop panel</p> }));
vi.mock("./IconSetPanel", () => ({ IconSetPanel: () => <p>icon set panel</p> }));
vi.mock("./FaviconPanel", () => ({ FaviconPanel: () => <p>favicon panel</p> }));
vi.mock("./AnimatorPanel", () => ({ AnimatorPanel: () => <p>animator panel</p> }));

const tabs: Tab[] = [{ id: 7, kind: "svg-playground", title: "SVG Studio" }];

beforeEach(() => {
  useSvgStudioStore.setState({ tool: "draw" });
});

it("swaps tools in front while Draw keeps its state", () => {
  render(<SvgPlaygroundStack tabs={tabs} activeId={7} workspaceRoot={null} />);
  fireEvent.click(screen.getByRole("button", { name: "Draw 0" }));

  fireEvent.click(screen.getByRole("tab", { name: "Palette" }));
  expect(screen.getByText("palette panel")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Palette" })).toHaveAttribute("aria-selected", "true");

  fireEvent.click(screen.getByRole("tab", { name: "Animate" }));
  expect(screen.queryByText("palette panel")).not.toBeInTheDocument();
  expect(screen.getByText("animator panel")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: "Draw" }));
  expect(screen.queryByText("animator panel")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Draw 1" })).toBeInTheDocument();
});

it("opens at whichever tool a caller asked for", () => {
  act(() => useSvgStudioStore.getState().setTool("favicon"));
  render(<SvgPlaygroundStack tabs={tabs} activeId={7} workspaceRoot={null} />);
  expect(screen.getByText("favicon panel")).toBeInTheDocument();
});

it("renders nothing when the Studio tab is not active", () => {
  const { container } = render(
    <SvgPlaygroundStack tabs={tabs} activeId={1} workspaceRoot={null} />,
  );
  expect(container).toBeEmptyDOMElement();
});
