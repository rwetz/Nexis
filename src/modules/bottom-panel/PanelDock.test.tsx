// @vitest-environment jsdom
import "@/test/dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, expect, it } from "vitest";
import { PACK_IDS } from "@/lib/packs";
import { usePluginRegistry } from "@/lib/plugins/registry";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { PanelDock } from "./PanelDock";
import { useBottomPanelStore } from "./store";

function Counter({ name }: { name: string }) {
  const [n, setN] = useState(0);
  return <button onClick={() => setN(n + 1)}>{name} {n}</button>;
}

beforeEach(() => {
  usePluginRegistry.setState({ panels: [] });
  usePreferencesStore.setState({ enabledPacks: [...PACK_IDS] });
  useBottomPanelStore.setState({ open: false, everOpened: false, tab: "build", maximized: false, status: {}, height: 240 });
});

const dock = (suppressed = false) => (
  <PanelDock workspace={<p>workspace</p>} renderBuiltin={(t) => <Counter name={t} />} suppressed={suppressed} />
);

it("mounts nothing until first opened", () => {
  render(dock());
  expect(screen.queryByRole("tablist")).toBeNull();
});

it("closing hides the panel without unmounting its sessions", () => {
  const { container } = render(dock());
  act(() => useBottomPanelStore.getState().show("build"));
  fireEvent.click(screen.getByRole("button", { name: "build 0" }));
  act(() => useBottomPanelStore.getState().close());
  const panel = container.querySelector("[aria-hidden='true'][inert]") as HTMLElement;
  expect(panel.style.height).toBe("0px");
  act(() => useBottomPanelStore.getState().toggle());
  expect(screen.getByRole("button", { name: "build 1" })).toBeInTheDocument();
});

it("retains a session through tab changes, maximize/restore, and collapse/reopen", () => {
  useBottomPanelStore.setState({ open: true, everOpened: true, tab: "build" });
  render(dock());

  fireEvent.click(screen.getByRole("button", { name: "build 0" }));
  fireEvent.click(screen.getByRole("tab", { name: /Tests/ }));
  expect(screen.getByRole("button", { name: "build 1", hidden: true })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Maximize panel" }));
  expect(screen.getByRole("button", { name: "Restore panel" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByRole("separator")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Restore panel" }));
  expect(screen.getByRole("separator")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Close panel" }));
  const hiddenPanel = document.querySelector("[data-bottom-panel]")?.closest("[aria-hidden='true'][inert]");
  expect(hiddenPanel).toHaveAttribute("aria-hidden", "true");
  act(() => useBottomPanelStore.getState().toggle());
  fireEvent.click(screen.getByRole("tab", { name: /Build/ }));
  expect(screen.getByRole("button", { name: "build 1" })).toBeInTheDocument();
});

it("steps aside in zen mode without closing", () => {
  useBottomPanelStore.setState({ open: true, everOpened: true });
  render(dock(true));
  expect(screen.queryByRole("separator")).toBeNull();
  expect(useBottomPanelStore.getState().open).toBe(true);
});

it("maximizes as an overlay, leaving the workspace in flow", () => {
  useBottomPanelStore.setState({ open: true, everOpened: true, maximized: true });
  render(dock());
  expect(screen.getByText("workspace")).toBeInTheDocument();
  expect(screen.getByRole("tablist").closest(".absolute")).not.toBeNull();
});

it("resizes from the keyboard within bounds", () => {
  useBottomPanelStore.setState({ open: true, everOpened: true });
  render(dock());
  fireEvent.keyDown(screen.getByRole("separator"), { key: "ArrowUp" });
  expect(useBottomPanelStore.getState().height).toBe(264);
});
