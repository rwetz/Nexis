// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import { dirname } from "./path";

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
