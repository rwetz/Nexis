// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import { sameProject, workspaceProjectKey } from "./identity";
import { workspaceScopeKey } from "./env";

describe("workspaceProjectKey", () => {
  it("identifies the project, unlike workspaceScopeKey", () => {
    // The distinction this module exists for: two different local projects
    // share an environment key and must not share a project key.
    const a = "C:/Users/me/projA";
    const b = "C:/Users/me/projB";
    expect(workspaceScopeKey({ kind: "local" })).toBe(
      workspaceScopeKey({ kind: "local" }),
    );
    expect(workspaceProjectKey(a)).not.toBe(workspaceProjectKey(b));
  });

  it("treats separator styles as the same project", () => {
    expect(workspaceProjectKey("C:\\Users\\me\\proj")).toBe(
      workspaceProjectKey("C:/Users/me/proj"),
    );
  });

  it("treats a trailing separator as the same project", () => {
    expect(workspaceProjectKey("C:/p/")).toBe(workspaceProjectKey("C:/p"));
    expect(workspaceProjectKey("/home/me/p/")).toBe(
      workspaceProjectKey("/home/me/p"),
    );
  });

  it("never collapses a filesystem root to nothing", () => {
    expect(workspaceProjectKey("/")).toBe("/");
    expect(workspaceProjectKey("C:/")).toBe("c:/");
  });

  it("heals a mangled verbatim prefix", () => {
    // Pitfall #23: "//?/C:/..." is a UNC path to server "?" and must not read
    // as a different workspace from the plain drive path.
    expect(workspaceProjectKey("//?/C:/Users/me/proj")).toBe(
      workspaceProjectKey("C:/Users/me/proj"),
    );
  });

  it("case-folds Windows and UNC paths", () => {
    expect(workspaceProjectKey("C:/Users/Me/Proj")).toBe(
      workspaceProjectKey("c:/users/me/proj"),
    );
    expect(workspaceProjectKey("//wsl.localhost/Ubuntu/home/me/P")).toBe(
      workspaceProjectKey("//wsl.localhost/ubuntu/home/me/p"),
    );
  });

  it("does NOT case-fold POSIX paths", () => {
    // On Linux these are genuinely different directories; folding them would
    // merge two projects' stored history.
    expect(workspaceProjectKey("/home/me/Proj")).not.toBe(
      workspaceProjectKey("/home/me/proj"),
    );
  });

  it("returns empty for no workspace", () => {
    expect(workspaceProjectKey(null)).toBe("");
    expect(workspaceProjectKey(undefined)).toBe("");
    expect(workspaceProjectKey("")).toBe("");
  });
});

describe("sameProject", () => {
  it("compares through the normalization", () => {
    expect(sameProject("C:\\p\\", "c:/p")).toBe(true);
    expect(sameProject("/home/a", "/home/b")).toBe(false);
  });

  it("treats an absent workspace as matching nothing, including itself", () => {
    // Two windows with no workspace open are not "the same project".
    expect(sameProject(null, null)).toBe(false);
    expect(sameProject("", "")).toBe(false);
    expect(sameProject("C:/p", null)).toBe(false);
  });
});
