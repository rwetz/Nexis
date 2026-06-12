// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import {
  appendPoint,
  binForRender,
  createSeriesMap,
  decimateHalf,
  MAX_POINTS,
  type Series,
} from "./series";

describe("appendPoint", () => {
  it("creates and grows series", () => {
    const map = createSeriesMap();
    appendPoint(map, "loss/train", 1, 0.9);
    appendPoint(map, "loss/train", 2, 0.7);
    appendPoint(map, "acc/val", 1, 0.5);
    expect(map.get("loss/train")).toEqual({ steps: [1, 2], values: [0.9, 0.7] });
    expect(map.get("acc/val")?.values).toEqual([0.5]);
  });

  it("drops non-finite values instead of poisoning the chart", () => {
    const map = createSeriesMap();
    appendPoint(map, "x", 1, Number.NaN);
    appendPoint(map, "x", 2, Number.POSITIVE_INFINITY);
    appendPoint(map, "x", 3, 1.0);
    expect(map.get("x")?.values).toEqual([1.0]);
  });

  it("caps memory: series never exceeds MAX_POINTS (pitfall #7 in spirit)", () => {
    const map = createSeriesMap();
    for (let i = 0; i < MAX_POINTS * 3; i++) {
      appendPoint(map, "x", i, Math.sin(i / 50));
    }
    const s = map.get("x");
    expect(s).toBeDefined();
    expect(s!.steps.length).toBeLessThanOrEqual(MAX_POINTS);
    expect(s!.steps.length).toBeGreaterThan(MAX_POINTS / 4);
    // still monotonically ordered after decimation
    for (let i = 1; i < s!.steps.length; i++) {
      expect(s!.steps[i]).toBeGreaterThan(s!.steps[i - 1]);
    }
  });
});

describe("decimateHalf", () => {
  it("preserves extreme values (spikes survive the downsample)", () => {
    const s: Series = { steps: [], values: [] };
    for (let i = 0; i < 1000; i++) {
      s.steps.push(i);
      s.values.push(i === 500 ? 99 : i === 700 ? -99 : 0);
    }
    const d = decimateHalf(s);
    expect(d.steps.length).toBeLessThan(s.steps.length);
    expect(Math.max(...d.values)).toBe(99);
    expect(Math.min(...d.values)).toBe(-99);
  });

  it("passes tiny series through intact", () => {
    const s: Series = { steps: [1, 2], values: [5, 6] };
    expect(decimateHalf(s)).toEqual({ steps: [1, 2], values: [5, 6] });
  });
});

describe("binForRender", () => {
  it("returns the series untouched when it already fits", () => {
    const s: Series = { steps: [1, 2, 3], values: [1, 2, 3] };
    expect(binForRender(s, 100)).toBe(s);
  });

  it("bins large series down and keeps min/max per bin", () => {
    const s: Series = { steps: [], values: [] };
    for (let i = 0; i < 10000; i++) {
      s.steps.push(i);
      s.values.push(i === 4321 ? 1000 : Math.sin(i));
    }
    const out = binForRender(s, 200);
    expect(out.steps.length).toBeLessThanOrEqual(400);
    expect(Math.max(...out.values)).toBe(1000);
  });
});
