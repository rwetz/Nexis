// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import { basename, canMoveInto, moveTargetDir } from "./dnd";

describe("basename", () => {
  it("returns the final segment", () => {
    expect(basename("/a/b/file.txt")).toBe("file.txt");
    expect(basename("/a/b")).toBe("b");
  });

  it("normalizes separators and trailing slashes", () => {
    expect(basename("C:\\a\\b\\file.txt")).toBe("file.txt");
    expect(basename("/a/b/")).toBe("b");
  });
});

describe("moveTargetDir", () => {
  it("targets a folder directly", () => {
    expect(moveTargetDir("/a/b", true)).toBe("/a/b");
  });

  it("routes a file into its parent directory", () => {
    expect(moveTargetDir("/a/b/file.txt", false)).toBe("/a/b");
  });

  it("routes a drive-root file into the drive root", () => {
    expect(moveTargetDir("C:/file.txt", false)).toBe("C:/");
  });
});

describe("canMoveInto", () => {
  it("allows moving a file into a sibling directory", () => {
    expect(canMoveInto("/a/b/file.txt", "/a/c")).toBe(true);
  });

  it("rejects moving into the current parent (no-op)", () => {
    expect(canMoveInto("/a/b/file.txt", "/a/b")).toBe(false);
  });

  it("rejects dropping a folder onto itself", () => {
    expect(canMoveInto("/a/b", "/a/b")).toBe(false);
  });

  it("rejects dropping a folder into its own descendant", () => {
    expect(canMoveInto("/a/b", "/a/b/c")).toBe(false);
    expect(canMoveInto("/a/b", "/a/b/c/d")).toBe(false);
  });

  it("allows moving a folder into an unrelated directory", () => {
    expect(canMoveInto("/a/b", "/a/c")).toBe(true);
  });

  it("treats a prefix that is not a path segment as movable", () => {
    // "/a/bc" is not inside "/a/b" even though the string starts with it.
    expect(canMoveInto("/a/b", "/a/bc")).toBe(true);
  });

  it("handles Windows drive roots without a false no-op", () => {
    // File already at the drive root → moving back to the root is a no-op.
    expect(canMoveInto("C:/file.txt", "C:/")).toBe(false);
    // File in a subfolder → moving up to the drive root is allowed.
    expect(canMoveInto("C:/proj/file.txt", "C:/")).toBe(true);
  });

  it("normalizes backslash paths", () => {
    expect(canMoveInto("C:\\proj\\file.txt", "C:\\proj")).toBe(false);
    expect(canMoveInto("C:\\proj\\file.txt", "C:\\other")).toBe(true);
  });
});
