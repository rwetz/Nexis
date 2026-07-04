// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import { absoluteDirname, dirname, displayDirname } from "./path";

describe("dirname", () => {
  it("returns null for null input", () => {
    expect(dirname(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(dirname("")).toBeNull();
  });

  it("returns / for a top-level Unix file", () => {
    expect(dirname("/foo")).toBe("/");
  });

  it("returns parent for Unix nested path", () => {
    expect(dirname("/foo/bar")).toBe("/foo");
    expect(dirname("/foo/bar/baz")).toBe("/foo/bar");
  });

  // Pitfall 12 regression: dirname("C:/file") used to return "C:" (missing
  // trailing slash), which broke git operations on drive-root files.
  it("preserves trailing slash for a file directly on a Windows drive root (pitfall 12)", () => {
    expect(dirname("C:/file.txt")).toBe("C:/");
  });

  it("returns drive root for a one-level Windows path (pitfall 12)", () => {
    expect(dirname("D:/foo")).toBe("D:/");
  });

  it("returns drive-letter parent for a deeper Windows path", () => {
    expect(dirname("C:/foo/bar")).toBe("C:/foo");
    expect(dirname("C:/foo/bar/baz.ts")).toBe("C:/foo/bar");
  });

  it("normalizes backslashes before computing parent (pitfall 12)", () => {
    expect(dirname("C:\\file.txt")).toBe("C:/");
    expect(dirname("C:\\foo\\bar")).toBe("C:/foo");
  });

  it("returns the input unchanged when no separator is present", () => {
    expect(dirname("relative")).toBe("relative");
  });
});

describe("displayDirname", () => {
  it("returns empty string when the path has no parent", () => {
    expect(displayDirname("README.md")).toBe("");
    expect(displayDirname("/file")).toBe("");
  });

  it("returns the parent of a repo-relative path", () => {
    expect(displayDirname("src/app.ts")).toBe("src");
    expect(displayDirname("src/modules/ai/agent.ts")).toBe("src/modules/ai");
  });

  it("normalizes backslashes", () => {
    expect(displayDirname("src\\modules\\ai\\agent.ts")).toBe("src/modules/ai");
  });

  // Pitfall 12 regression: naive implementations returned "C:" for drive-root
  // files, rendering a slash-less drive as the parent label.
  it("preserves the Windows drive root (pitfall 12)", () => {
    expect(displayDirname("C:/file.txt")).toBe("C:/");
    expect(displayDirname("C:\\file.txt")).toBe("C:/");
  });
});

describe("absoluteDirname", () => {
  it("floors at the Unix root", () => {
    expect(absoluteDirname("/file")).toBe("/");
    expect(absoluteDirname("/foo/bar")).toBe("/foo");
  });

  it("normalizes backslashes", () => {
    expect(absoluteDirname("C:\\Users\\Ryan")).toBe("C:/Users");
  });

  // Pitfall 12 regression: parent-navigation on a drive-root file must land on
  // "C:/", not a slash-less "C:" (which git and cd reject).
  it("preserves the Windows drive root (pitfall 12)", () => {
    expect(absoluteDirname("C:/file.txt")).toBe("C:/");
    expect(absoluteDirname("D:/foo")).toBe("D:/");
    expect(absoluteDirname("C:/foo/bar")).toBe("C:/foo");
  });
});
