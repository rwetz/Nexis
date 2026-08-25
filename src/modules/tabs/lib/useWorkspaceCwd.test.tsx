// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// @vitest-environment jsdom
import "@/test/dom";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Tab, TerminalTab } from "./tabTypes";
import { useWorkspaceCwd } from "./useWorkspaceCwd";

function terminalTab(overrides: Partial<TerminalTab> = {}): TerminalTab {
  const leafId = overrides.id ? (overrides.id + 1) * 10 : 20;
  return {
    id: 1,
    kind: "terminal",
    title: "shell",
    cwd: "/home/one",
    paneTree: { kind: "leaf", id: leafId, cwd: "/home/one" },
    activeLeafId: leafId,
    ...overrides,
  };
}

describe("useWorkspaceCwd", () => {
  it("prefers the active terminal tab's cwd for new tabs", () => {
    const active = terminalTab({ cwd: "/home/active" });
    const other = terminalTab({ id: 2, cwd: "/home/other" });
    const { result } = renderHook(() => useWorkspaceCwd(active, [active, other], "/home"));
    expect(result.current.inheritedCwdForNewTab()).toBe("/home/active");
    expect(result.current.explorerRoot).toBe("/home/active");
  });

  it("an active editor tab inherits the last terminal's cwd, not the file's folder", () => {
    // The pitfall-19 amplifier story lives here: new-tab inheritance must not
    // resurrect a stale path, and must not hijack the user's shell context.
    const term = terminalTab({ cwd: "/home/shell-cwd" });
    const { result, rerender } = renderHook(
      ({ active }: { active: Tab }) =>
        useWorkspaceCwd(active, [term, active] as Tab[], "/home"),
      { initialProps: { active: term as Tab } },
    );

    const editor = {
      id: 5,
      kind: "editor",
      title: "file.ts",
      paneTree: { kind: "leaf", id: 6, path: "/home/project/src/file.ts" },
      activeLeafId: 6,
    } as unknown as Tab;
    rerender({ active: editor });

    expect(result.current.inheritedCwdForNewTab()).toBe("/home/shell-cwd");
    expect(result.current.explorerRoot).toBe("/home/shell-cwd");
  });

  it("falls back to home when no terminal has ever been open", () => {
    const editor = {
      id: 3,
      kind: "editor",
      title: "a.ts",
      paneTree: { kind: "leaf", id: 4, path: "/elsewhere/a.ts" },
      activeLeafId: 4,
    } as unknown as Tab;
    const { result } = renderHook(() => useWorkspaceCwd(editor, [editor], "/home"));
    expect(result.current.inheritedCwdForNewTab()).toBe("/home");
    expect(result.current.explorerRoot).toBe("/home");
  });

  it("falls back to any terminal tab's cwd when the active tab is an editor and no terminal was focused before", () => {
    const editor = {
      id: 7,
      kind: "editor",
      title: "b.ts",
      paneTree: { kind: "leaf", id: 8, path: "/x/b.ts" },
      activeLeafId: 8,
    } as unknown as Tab;
    const term = terminalTab({ id: 2, cwd: "/home/other-shell" });
    // Fresh mount straight onto the editor — no prior terminal was ever
    // active, so explorerRoot may borrow from any open terminal…
    const first = renderHook(() => useWorkspaceCwd(editor, [editor, term], "/home"));
    expect(first.result.current.explorerRoot).toBe("/home/other-shell");

    // …but inheritedCwdForNewTab only remembers cwds of terminals that were
    // actually active at some point.
    expect(first.result.current.inheritedCwdForNewTab()).toBe("/home");
  });

  it("tracks cwd changes on the active terminal tab across rerenders", () => {
    const initial = terminalTab({ cwd: "/before" });
    const { result, rerender } = renderHook(
      ({ active }: { active: Tab }) => useWorkspaceCwd(active, [active] as Tab[], "/home"),
      { initialProps: { active: initial as Tab } },
    );
    const moved = terminalTab({ cwd: "/after" });
    act(() => {
      rerender({ active: moved });
    });
    expect(result.current.inheritedCwdForNewTab()).toBe("/after");
  });

  it("handles null home without throwing", () => {
    const { result } = renderHook(() => useWorkspaceCwd(undefined, [], null));
    expect(result.current.explorerRoot).toBeNull();
    expect(result.current.inheritedCwdForNewTab()).toBeUndefined();
  });
});
