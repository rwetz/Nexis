// @vitest-environment jsdom
import "@/test/dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { createPluginAPI, usePluginRegistry } from "@/lib/plugins/registry";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { PanelHost } from "./PanelHost";
import { CapabilityHost } from "./CapabilityHost";
import { dispatchContributedShortcut, executeCommand } from "./commands";
import type { CapabilityContext, CapabilityDefinition } from "./capability";

beforeEach(() => {
  usePluginRegistry.setState({ panels: [], commands: new Map() });
  usePreferencesStore.setState({ enabledPacks: ["dev-tools"] });
});

function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>Count {count}</button>;
}

it("retains state inertly, routes activation focus, and releases disabled panels", () => {
  createPluginAPI().registerPanel({ id: "test:retained", title: "Retained", location: "sidebar", pack: "dev-tools", lifecycle: "retain", render: () => <Counter /> });
  const host = (view: "explorer" | "plugin:test:retained") => <PanelHost view={view} fallback={<p>Files</p>} onShowExplorer={() => {}} />;
  const result = render(host("explorer"));
  result.rerender(host("plugin:test:retained"));
  const panel = screen.getByRole("button").parentElement!;
  expect(panel).toHaveFocus();
  fireEvent.click(screen.getByRole("button"));
  result.rerender(host("explorer"));
  expect(panel).toHaveAttribute("inert");
  expect(panel).not.toBeVisible();
  result.rerender(host("plugin:test:retained"));
  expect(screen.getByRole("button")).toHaveTextContent("Count 1");
  result.rerender(host("explorer"));
  act(() => usePreferencesStore.setState({ enabledPacks: [] }));
  expect(panel).not.toBeInTheDocument();
  act(() => usePreferencesStore.setState({ enabledPacks: ["dev-tools"] }));
  result.rerender(host("plugin:test:retained"));
  expect(screen.getByRole("button")).toHaveTextContent("Count 0");
});

it("unmount lifecycle resets panel state but switching legacy fallback views preserves it", () => {
  createPluginAPI().registerPanel({ id: "test:temporary", title: "Temporary", location: "sidebar", render: () => <Counter /> });
  const host = (view: "explorer" | "processes" | "plugin:test:temporary") => <PanelHost view={view} fallback={<Counter />} onShowExplorer={() => {}} />;
  const result = render(host("explorer"));
  fireEvent.click(screen.getByRole("button"));
  result.rerender(host("processes"));
  expect(screen.getByRole("button")).toHaveTextContent("Count 1");
  result.rerender(host("plugin:test:temporary"));
  fireEvent.click(screen.getByRole("button"));
  result.rerender(host("explorer"));
  result.rerender(host("plugin:test:temporary"));
  expect(screen.getByRole("button")).toHaveTextContent("Count 0");
});

it("activation is safe under StrictMode and commands use the latest host context", async () => {
  const first = vi.fn();
  const second = vi.fn();
  const definitions: CapabilityDefinition[] = [{ id: "test:capability", panels: [{ id: "test:panel", location: "sidebar", title: "Test", render: () => null }], commands: (context) => [{ id: "test:run", title: "Run", handler: () => context().notify("Run") }] }];
  const host = (notify: typeof first) => <StrictMode><CapabilityHost definitions={definitions} context={{ notify } as unknown as CapabilityContext}><p>Host</p></CapabilityHost></StrictMode>;
  const result = render(host(first));
  expect(usePluginRegistry.getState().panels).toHaveLength(1);
  result.rerender(host(second));
  await executeCommand("test:run", { activePanelId: null, inputFocused: false });
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledWith("Run");
  result.unmount();
  expect(usePluginRegistry.getState().panels).toHaveLength(0);
  expect(usePluginRegistry.getState().commands.size).toBe(0);
});

it("scoped shortcut dispatch respects focus, inputs, composition, and current pack state", () => {
  const handler = vi.fn();
  createPluginAPI().registerCommand({ id: "test:refresh", title: "Refresh", pack: "dev-tools", scope: { panelId: "test:panel" }, keybindings: [{ key: "r" }], handler });
  render(<><div data-panel-id="test:panel"><button>Refresh</button><input aria-label="Search" /></div><button>Outside</button></>);
  const dispatch = (target: Element, options: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent("keydown", { key: "r", bubbles: true, cancelable: true, ...options });
    target.dispatchEvent(event);
    return dispatchContributedShortcut(event);
  };
  expect(dispatch(screen.getByText("Outside"))).toBe(false);
  expect(dispatch(screen.getByRole("textbox"))).toBe(false);
  expect(dispatch(screen.getByText("Refresh"), { isComposing: true })).toBe(false);
  expect(dispatch(screen.getByText("Refresh"))).toBe(true);
  expect(handler).toHaveBeenCalledTimes(1);
  act(() => usePreferencesStore.setState({ enabledPacks: [] }));
  expect(dispatch(screen.getByText("Refresh"))).toBe(false);
  expect(handler).toHaveBeenCalledTimes(1);
});
