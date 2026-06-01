import { beforeEach, describe, expect, it } from "vitest";
import { usePluginRegistry } from "./registry";
import type { StatusBarItem } from "./types";

function makeItem(id: string, side: "left" | "right"): StatusBarItem {
  return {
    id,
    side,
    priority: 0,
    render: () => null as any,
  };
}

describe("usePluginRegistry — selector stability (pitfall 14)", () => {
  beforeEach(() => {
    // Reset to a clean store before each test.
    usePluginRegistry.setState({ statusBarItems: [], panels: [], commands: new Map() });
  });

  it("getState().statusBarItems returns the same array reference on back-to-back calls when no mutation occurred", () => {
    const ref1 = usePluginRegistry.getState().statusBarItems;
    const ref2 = usePluginRegistry.getState().statusBarItems;
    // Zustand's structural sharing must guarantee reference equality when the
    // store has not changed between reads. If this fails, any selector that
    // returns statusBarItems would cause useSyncExternalStore to loop.
    expect(ref1).toBe(ref2);
  });

  it("statusBarItems reference changes after a mutation but stabilises immediately after", () => {
    const before = usePluginRegistry.getState().statusBarItems;

    usePluginRegistry.getState()._addStatusBarItem(makeItem("a", "left"));

    const after1 = usePluginRegistry.getState().statusBarItems;
    const after2 = usePluginRegistry.getState().statusBarItems;

    // A mutation must produce a new reference (so subscribers re-render once).
    expect(after1).not.toBe(before);
    // But back-to-back reads after the mutation must return the same reference
    // (so the selector does not keep triggering re-renders).
    expect(after1).toBe(after2);
  });

  it("demonstrates that inline .filter() inside a selector always creates a new reference — the pitfall 14 root cause", () => {
    const state = usePluginRegistry.getState();

    // Simulates the BAD selector pattern: (s) => s.statusBarItems.filter(...)
    // Each getSnapshot call returns a brand-new array, so Object.is always fails
    // and useSyncExternalStore schedules an endless chain of re-renders.
    const badSelector = (s: typeof state) =>
      s.statusBarItems.filter((i) => i.side === "left");

    const slice1 = badSelector(state);
    const slice2 = badSelector(state);

    expect(slice1).toEqual(slice2);    // same content
    expect(slice1).not.toBe(slice2);   // different reference — this is the pitfall
  });

  it("correct pattern: select the stable array, filter in the render body", () => {
    usePluginRegistry.getState()._addStatusBarItem(makeItem("left-1", "left"));
    usePluginRegistry.getState()._addStatusBarItem(makeItem("right-1", "right"));

    // The fix used in StatusBar.tsx: selector returns the whole array (stable
    // reference), and .filter() is called outside the selector.
    const allItems = usePluginRegistry.getState().statusBarItems;
    const leftItems = allItems.filter((i) => i.side === "left");
    const rightItems = allItems.filter((i) => i.side === "right");

    expect(leftItems).toHaveLength(1);
    expect(rightItems).toHaveLength(1);
    // The primary array reference is stable; only the filtered results are new,
    // which is fine because they live in the render function, not getSnapshot.
    expect(usePluginRegistry.getState().statusBarItems).toBe(allItems);
  });
});
