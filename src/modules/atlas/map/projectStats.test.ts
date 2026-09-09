import { describe, expect, it } from "vitest";
import { formatSoloTime, formatTypingTime, projectStats } from "./projectStats";
import type { TreeNode } from "@/modules/atlas/repos/types";

const file = (name: string, lines: number, bytes: number): TreeNode => ({
  name,
  path: name,
  is_dir: false,
  lines,
  bytes,
  lang: "TypeScript",
  status: null,
  dirty: 0,
  children: [],
});

describe("projectStats", () => {
  it("uses only actually counted source files for the playful size signals", () => {
    const root: TreeNode = {
      name: "demo",
      path: "",
      is_dir: true,
      lines: 400,
      bytes: 90_000,
      lang: "TypeScript",
      status: null,
      dirty: 0,
      children: [file("app.ts", 300, 12_000), file("logo.png", 0, 78_000), file("test.ts", 100, 0)],
    };

    expect(projectStats(root)).toMatchObject({
      lines: 400,
      codeFiles: 2,
      codeBytes: 12_000,
      averageLines: 200,
      soloDays: 5,
      typingMinutes: 60,
      coffeeCups: 10,
    });
  });

  it("formats size estimates at human scales", () => {
    expect(formatSoloTime(0.4)).toBe("~4h");
    expect(formatSoloTime(15)).toBe("~3 weeks");
    expect(formatTypingTime(45)).toBe("~45 min");
    expect(formatTypingTime(90)).toBe("~1.5h");
  });
});
