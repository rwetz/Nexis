// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { beforeEach, describe, expect, it } from "vitest";
import { pushRecentWorkspace, useRecentWorkspaces } from "./useRecentWorkspaces";

function stored(): string[] {
  return useRecentWorkspaces.getState().workspaces.map((w) => w.path);
}

beforeEach(() => {
  // Reset the module-global store between tests.
  useRecentWorkspaces.setState({ workspaces: [] });
  try {
    localStorage.clear();
  } catch {
    /* node env has none */
  }
});

describe("useRecentWorkspaces", () => {
  it("pushes most-recent-first and keeps the list capped", () => {
    for (let i = 0; i < 15; i++) pushRecentWorkspace(`/ws/${i}`);
    const paths = stored();
    expect(paths).toHaveLength(12); // MAX_ENTRIES
    expect(paths[0]).toBe("/ws/14");
    expect(paths).not.toContain("/ws/0");
  });

  it("moves an existing entry to the front instead of duplicating it", () => {
    pushRecentWorkspace("/ws/a");
    pushRecentWorkspace("/ws/b");
    pushRecentWorkspace("/ws/a");
    expect(stored()).toEqual(["/ws/a", "/ws/b"]);
  });

  it("strips a mangled verbatim prefix before storing (pitfall 23)", () => {
    // workspace_current_dir used to hand the frontend "//?/C:/…" — that form
    // must never reach Recent Workspaces, where picking it would brick every
    // new terminal's spawn cwd.
    pushRecentWorkspace("//?/C:/Users/ryan/repo");
    expect(stored()).toEqual(["C:/Users/ryan/repo"]);
  });

  it("strips a native verbatim prefix and normalizes separators", () => {
    pushRecentWorkspace("\\\\?\\C:\\Users\\ryan\\repo");
    expect(stored()).toEqual(["C:/Users/ryan/repo"]);
  });

  it("deduplicates after normalization — poisoned and clean forms collapse", () => {
    pushRecentWorkspace("//?/C:/ws/one");
    pushRecentWorkspace("C:/ws/one");
    expect(stored()).toEqual(["C:/ws/one"]);
  });

  it("remove drops only the named entry", () => {
    pushRecentWorkspace("/ws/a");
    pushRecentWorkspace("/ws/b");
    useRecentWorkspaces.getState().remove("/ws/a");
    expect(stored()).toEqual(["/ws/b"]);
  });
});
