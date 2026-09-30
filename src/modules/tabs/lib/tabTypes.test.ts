// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import {
  editorActivePath,
  editorAnyDirty,
  editorLeafPaths,
  nextIdAfter,
  titleFromUrl,
  type EditorTab,
  type Tab,
} from "./tabTypes";

function editorTab(overrides: Partial<EditorTab> = {}): EditorTab {
  return {
    id: 1,
    kind: "editor",
    title: "a.ts",
    paneTree: { kind: "leaf", id: 2, path: "/w/a.ts" },
    activeLeafId: 2,
    ...overrides,
  };
}

describe("tabTypes editor helpers", () => {
  it("editorActivePath returns the focused pane's path, or empty", () => {
    expect(editorActivePath(editorTab())).toBe("/w/a.ts");
    expect(editorActivePath(editorTab({ activeLeafId: 99 }))).toBe("");
  });

  it("editorLeafPaths walks the whole split tree left-to-right", () => {
    const tab = editorTab({
      paneTree: {
        kind: "split",
        id: 10,
        dir: "row",
        children: [
          { kind: "leaf", id: 11, path: "/w/left.ts" },
          {
            kind: "split",
            id: 12,
            dir: "col",
            children: [
              { kind: "leaf", id: 13, path: "/w/mid.ts" },
              { kind: "leaf", id: 14, path: "/w/right.ts" },
            ],
          },
        ],
      },
      activeLeafId: 13,
    });
    expect(editorLeafPaths(tab)).toEqual(["/w/left.ts", "/w/mid.ts", "/w/right.ts"]);
    expect(editorActivePath(tab)).toBe("/w/mid.ts");
  });

  it("editorAnyDirty is true when any pane has unsaved changes", () => {
    const clean = editorTab();
    expect(editorAnyDirty(clean)).toBe(false);
    const dirty = editorTab({
      paneTree: {
        kind: "split",
        id: 20,
        dir: "row",
        children: [
          { kind: "leaf", id: 21, path: "/w/a.ts" },
          { kind: "leaf", id: 22, path: "/w/b.ts", dirty: true },
        ],
      },
    });
    // This guard blocks workspace switches — a false negative would lose
    // edits, so it must see dirt anywhere in the tree.
    expect(editorAnyDirty(dirty)).toBe(true);
  });
});

describe("titleFromUrl", () => {
  it("prefers the host for parseable URLs — port included (URL.host semantics)", () => {
    expect(titleFromUrl("http://localhost:5173/dashboard")).toBe("localhost:5173");
  });

  it("falls back to the raw string (or 'preview') when parsing fails", () => {
    expect(titleFromUrl("not a url")).toBe("not a url");
    expect(titleFromUrl("")).toBe("preview");
  });
});

describe("nextIdAfter", () => {
  it("starts past the launch-folder terminal's tab and leaf ids", () => {
    // The shape useTabs builds for `nexis <folder>`: tab 1, leaf 2. The
    // hand-kept count used to answer 1 here, so the next tab reused the
    // terminal's id and could never become the active tab.
    const launched: Tab[] = [
      {
        id: 1,
        kind: "terminal",
        title: "shell",
        cwd: "/w",
        paneTree: { kind: "leaf", id: 2, cwd: "/w" },
        activeLeafId: 2,
      },
    ];
    expect(nextIdAfter(launched)).toBe(3);
  });

  it("counts split nodes and nested leaves, and tabs without panes", () => {
    const tabs: Tab[] = [
      {
        id: 1,
        kind: "editor",
        title: "a",
        activeLeafId: 12,
        paneTree: {
          kind: "split",
          id: 10,
          dir: "row",
          children: [
            { kind: "leaf", id: 11, path: "/w/a.ts" },
            { kind: "leaf", id: 12, path: "/w/b.ts" },
          ],
        },
      },
      { id: 5, kind: "web", title: "Web" },
    ];
    expect(nextIdAfter(tabs)).toBe(13);
  });

  it("is 1 with no tabs", () => {
    expect(nextIdAfter([])).toBe(1);
  });
});
