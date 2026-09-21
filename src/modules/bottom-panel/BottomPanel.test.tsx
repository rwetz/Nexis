// @vitest-environment jsdom
import "@/test/dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, expect, it } from "vitest";
import { PACK_IDS } from "@/lib/packs";
import { usePluginRegistry } from "@/lib/plugins/registry";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { BottomPanel } from "./BottomPanel";
import { PROBLEMS_TAB, useBottomPanelStore } from "./store";

function Counter({ name }: { name: string }) {
  const [n, setN] = useState(0);
  return <button onClick={() => setN(n + 1)}>{name} {n}</button>;
}

beforeEach(() => {
  usePluginRegistry.setState({ panels: [] });
  usePreferencesStore.setState({ enabledPacks: [...PACK_IDS] });
  useBottomPanelStore.setState({ open: true, tab: "build", maximized: false, status: {} });
});

const renderBuiltin = (tab: string) => <Counter name={tab} />;

it("keeps a session mounted, with its state, while another tab is in front", () => {
  render(<BottomPanel renderBuiltin={renderBuiltin} />);
  fireEvent.click(screen.getByRole("button", { name: "build 0" }));
  fireEvent.click(screen.getByRole("tab", { name: /Tests/ }));
  expect(screen.getByRole("tab", { name: /Tests/ })).toHaveAttribute("aria-selected", "true");
  fireEvent.click(screen.getByRole("tab", { name: /Build/ }));
  expect(screen.getByRole("button", { name: "build 1" })).toBeInTheDocument();
});

it("does not mount a tab until it is first shown", () => {
  render(<BottomPanel renderBuiltin={renderBuiltin} />);
  expect(screen.queryByRole("button", { name: /^repl/, hidden: true })).toBeNull();
});

it("marks a running session on its tab", () => {
  useBottomPanelStore.getState().reportStatus("tests", "running");
  render(<BottomPanel renderBuiltin={renderBuiltin} />);
  expect(screen.getByLabelText("running")).toBeInTheDocument();
});

it("falls back to Problems for a tab that no longer exists", () => {
  useBottomPanelStore.setState({ tab: "plugin:gone:away" });
  render(<BottomPanel renderBuiltin={renderBuiltin} />);
  expect(screen.getByRole("tab", { name: /Problems/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("button", { name: `${PROBLEMS_TAB} 0` })).toBeInTheDocument();
});
