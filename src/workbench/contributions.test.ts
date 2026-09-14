import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPluginAPI, usePluginRegistry } from "@/lib/plugins/registry";
import { commandEnabled } from "./contributions";

beforeEach(() => usePluginRegistry.setState({ panels: [], commands: new Map() }));

describe("contribution policies", () => {
  it("rejects ambiguous ids and duplicate registrations without replacing the owner", () => {
    const api = createPluginAPI();
    const command = { id: "test:run", title: "Run", handler: vi.fn() };
    api.registerCommand(command);
    expect(() => api.registerCommand({ ...command, id: "run" })).toThrow("namespaced");
    expect(() => api.registerCommand({ ...command })).toThrow("Duplicate");
    expect(usePluginRegistry.getState().commands.get(command.id)).toBe(command);
    const panel = { id: "test:panel", title: "Panel", location: "sidebar" as const, render: () => null };
    api.registerPanel(panel);
    expect(() => api.registerPanel(panel)).toThrow("Duplicate");
  });

  it("old disposables cannot remove a later registration, even using the same object", () => {
    const api = createPluginAPI();
    const command = { id: "test:run", title: "Run", handler: vi.fn() };
    const first = api.registerCommand(command);
    first.dispose();
    const second = api.registerCommand(command);
    first.dispose();
    expect(usePluginRegistry.getState().commands.get(command.id)).toBe(command);
    second.dispose();
    expect(usePluginRegistry.getState().commands.size).toBe(0);
  });

  it("panel commands cannot run from another panel or consume text input", () => {
    const command = { scope: { panelId: "atlas:main" } };
    expect(commandEnabled(command, { activePanelId: "editor:main", inputFocused: false })).toBe(false);
    expect(commandEnabled(command, { activePanelId: "atlas:main", inputFocused: true })).toBe(false);
    expect(commandEnabled(command, { activePanelId: "atlas:main", inputFocused: false })).toBe(true);
    expect(commandEnabled({ enabled: () => false }, { activePanelId: null, inputFocused: false })).toBe(false);
  });
});
