// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import {
  bucketMagnitudes,
  columnsForMlp,
  drawnColumn,
  MAX_DRAWN_NODES,
  parseWeights,
} from "./netgraph";

describe("drawnColumn / columnsForMlp", () => {
  it("draws small layers one node per unit", () => {
    expect(drawnColumn("classes", 3)).toEqual({
      label: "classes",
      total: 3,
      drawn: 3,
      bucket: 1,
    });
  });

  it("buckets large layers down to the node cap", () => {
    const col = drawnColumn("hidden", 64);
    expect(col.drawn).toBe(MAX_DRAWN_NODES);
    expect(col.bucket).toBe(Math.ceil(64 / MAX_DRAWN_NODES));
  });

  it("renders ghost nodes for unknown counts", () => {
    const col = drawnColumn("inputs", null);
    expect(col.total).toBeNull();
    expect(col.drawn).toBeGreaterThan(0);
  });

  it("lays out inputs → hidden… → classes", () => {
    const cols = columnsForMlp(8, [64, 32], 3);
    expect(cols.map((c) => c.label)).toEqual([
      "inputs",
      "hidden 1",
      "hidden 2",
      "classes",
    ]);
  });
});

describe("parseWeights", () => {
  const good = {
    layers: [{ in: 2, out: 3, w: [[1, -2, 0.5], [0, 4, -1]] }],
  };

  it("accepts a well-formed file", () => {
    expect(parseWeights(good)).toEqual(good);
  });

  it("rejects shape mismatches and non-numeric cells (never throws)", () => {
    expect(parseWeights(null)).toBeNull();
    expect(parseWeights({})).toBeNull();
    expect(parseWeights({ layers: [] })).toBeNull();
    expect(
      parseWeights({ layers: [{ in: 2, out: 3, w: [[1, 2, 3]] }] }), // 1 row ≠ in:2
    ).toBeNull();
    expect(
      parseWeights({ layers: [{ in: 1, out: 2, w: [[1, "x"]] }] }),
    ).toBeNull();
    expect(
      parseWeights({ layers: [{ in: 1, out: 1, w: [[Infinity]] }] }),
    ).toBeNull();
  });
});

describe("bucketMagnitudes", () => {
  it("normalizes the strongest bucket to 1 and averages |w|", () => {
    const grid = bucketMagnitudes(
      { in: 2, out: 2, w: [[1, 0], [0, -0.5]] },
      2,
      2,
    );
    expect(grid[0][0]).toBe(1); // |1| is the max
    expect(grid[1][1]).toBe(0.5); // |-0.5| / 1
    expect(grid[0][1]).toBe(0);
  });

  it("buckets a larger matrix into the drawn grid", () => {
    // 4 in-units → 2 drawn nodes: each drawn edge averages a 2×1 bucket.
    const grid = bucketMagnitudes(
      { in: 4, out: 1, w: [[4], [0], [2], [2]] },
      2,
      1,
    );
    // bucket A = mean(4, 0) = 2; bucket B = mean(2, 2) = 2 → both normalize to 1.
    expect(grid).toEqual([[1], [1]]);
  });

  it("handles an all-zero layer without dividing by zero", () => {
    const grid = bucketMagnitudes({ in: 1, out: 1, w: [[0]] }, 1, 1);
    expect(grid).toEqual([[0]]);
  });
});
