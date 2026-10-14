// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import {
  dataOverrides,
  guessTarget,
  isCandidateCsv,
  relativeDataPath,
  summarizeCsv,
  summarizeTarget,
} from "./data-source";
import { applyOverrides } from "./model-blueprint";
import { parseDataConfig } from "./netspec";

// What `nexis-ml new tabular` writes: no [data] section at all.
const SCAFFOLD = `# nexis-ml-rs (Phase 3 engine) — an MLP over tabular data.

[train]
epochs = 150
samples = 240        # synthetic two-blob points (when no [data] path)

[model]
hidden = [32, 16]  # MLP hidden-layer widths
`;

const PLANTS = `light_hours,waterings_per_week,health
5.2,1.2,1
3.8,0.8,1
13.3,4.5,0
8.2,1.1,2
`;

describe("relativeDataPath", () => {
  it("keeps files inside the project relative to it", () => {
    expect(relativeDataPath("C:\\ws\\plant-doctor", "C:/ws/plant-doctor/data/plants.csv")).toBe(
      "data/plants.csv",
    );
  });

  it("walks up for workspace files outside the project", () => {
    expect(relativeDataPath("C:/ws/plant-doctor", "c:/ws/data/plants.csv")).toBe(
      "../data/plants.csv",
    );
    expect(relativeDataPath("/home/u/ws/a/b", "/home/u/ws/c.csv")).toBe("../../c.csv");
  });

  it("refuses a file on another drive", () => {
    expect(relativeDataPath("C:/ws/p", "D:/data.csv")).toBeNull();
  });
});

describe("isCandidateCsv", () => {
  it("skips run output and dependency folders", () => {
    expect(isCandidateCsv("plant-doctor/data/plants.csv")).toBe(true);
    expect(isCandidateCsv("plant-doctor/runs/r1/predictions.csv")).toBe(false);
    expect(isCandidateCsv("node_modules/x/data.csv")).toBe(false);
    expect(isCandidateCsv("notes.txt")).toBe(false);
  });
});

describe("CSV preview", () => {
  it("counts rows and reads the header", () => {
    expect(summarizeCsv(PLANTS)).toEqual({
      columns: ["light_hours", "waterings_per_week", "health"],
      rows: 4,
    });
  });

  it("counts classes in the target column", () => {
    expect(summarizeTarget(PLANTS, "health")).toEqual({
      classes: [
        ["0", 1],
        ["1", 2],
        ["2", 1],
      ],
      distinct: 3,
      numeric: true,
      missing: 0,
    });
  });

  it("flags text labels and blanks, and gives up on continuous columns", () => {
    const words = summarizeTarget("x,label\n1,cat\n2,\n3,dog\n", "label");
    expect(words).toMatchObject({ numeric: false, missing: 1, distinct: 2 });
    const many = ["x,y", ...Array.from({ length: 30 }, (_, i) => `${i},${i}`)].join("\n");
    expect(summarizeTarget(many, "y")?.classes).toBeNull();
    expect(summarizeTarget(PLANTS, "nope")).toBeNull();
  });

  it("guesses a label-ish column, else the last one", () => {
    expect(guessTarget(["a", "Label", "b"])).toBe("Label");
    expect(guessTarget(["light_hours", "health"])).toBe("health");
    expect(guessTarget([])).toBeNull();
  });
});

describe("dataOverrides", () => {
  it("adds a [data] section to a scaffold that has none", () => {
    const { text, skipped } = applyOverrides(SCAFFOLD, dataOverrides("data/plants.csv", "health"));
    expect(skipped).toEqual([]);
    expect(parseDataConfig(text)).toEqual({ path: "data/plants.csv", target: "health" });
    // The user's comments survive.
    expect(text).toContain("# MLP hidden-layer widths");
  });

  it("replaces an existing choice in place, keeping its comments", () => {
    const first = applyOverrides(SCAFFOLD, dataOverrides("a.csv", "y")).text.replace(
      'path = "a.csv"',
      'path = "a.csv"   # old data',
    );
    const { text } = applyOverrides(first, dataOverrides("../data/plants.csv", "health"));
    expect(parseDataConfig(text)).toEqual({ path: "../data/plants.csv", target: "health" });
    expect(text).toContain("# old data");
    expect(text.match(/^\[data\]/gm)).toHaveLength(1);
  });

  it("escapes quotes and backslashes in names", () => {
    expect(dataOverrides('we"ird\\.csv', "t")[0].value).toBe('"we\\"ird\\\\.csv"');
  });
});
