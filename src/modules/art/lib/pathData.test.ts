// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import {
  controlAnchor,
  mapPathString,
  movePathPoint,
  parsePath,
  pathPoints,
  scalePath,
  serializePath,
  translatePath,
} from "./pathData";

describe("parsePath — normalization", () => {
  it("reads an absolute move-and-line path", () => {
    expect(parsePath("M 10 20 L 30 40")).toEqual([
      { cmd: "M", x: 10, y: 20 },
      { cmd: "L", x: 30, y: 40 },
    ]);
  });

  it("resolves relative commands against the current point", () => {
    expect(parsePath("m 10 10 l 5 0 l 0 5")).toEqual([
      { cmd: "M", x: 10, y: 10 },
      { cmd: "L", x: 15, y: 10 },
      { cmd: "L", x: 15, y: 15 },
    ]);
  });

  it("treats a repeated pair after M as an implicit lineto", () => {
    expect(parsePath("M 0 0 10 0 10 10")).toEqual([
      { cmd: "M", x: 0, y: 0 },
      { cmd: "L", x: 10, y: 0 },
      { cmd: "L", x: 10, y: 10 },
    ]);
  });

  it("expands H and V into absolute lines", () => {
    expect(parsePath("M 5 5 H 20 V 30 h -5")).toEqual([
      { cmd: "M", x: 5, y: 5 },
      { cmd: "L", x: 20, y: 5 },
      { cmd: "L", x: 20, y: 30 },
      { cmd: "L", x: 15, y: 30 },
    ]);
  });

  it("reflects S into a full cubic", () => {
    const segs = parsePath("M 0 0 C 1 2 3 4 5 6 S 9 10 11 12");
    expect(segs[2]).toEqual({
      cmd: "C",
      // Reflection of (3,4) through the current point (5,6).
      x1: 7,
      y1: 8,
      x2: 9,
      y2: 10,
      x: 11,
      y: 12,
    });
  });

  it("reflects T into a full quadratic", () => {
    const segs = parsePath("M 0 0 Q 2 4 6 8 T 12 16");
    expect(segs[2]).toEqual({ cmd: "Q", x1: 10, y1: 12, x: 12, y: 16 });
  });

  it("returns to the subpath start on Z", () => {
    const segs = parsePath("M 4 4 L 9 9 Z l 1 1");
    expect(segs[3]).toEqual({ cmd: "L", x: 5, y: 5 });
  });

  /**
   * The trap this module exists to avoid: the arc grammar lets both flags run
   * together with the following coordinate, so `011 1` is flag 0, flag 1, then
   * x=1. A generic number scanner reads `011` as a single value and produces a
   * corrupt arc with no error anywhere.
   */
  it("reads run-together arc flags", () => {
    expect(parsePath("M 0 0 a 5 5 0 011 1")).toEqual([
      { cmd: "M", x: 0, y: 0 },
      { cmd: "A", rx: 5, ry: 5, rot: 0, large: 0, sweep: 1, x: 1, y: 1 },
    ]);
  });

  it("accepts comma and exponent spellings", () => {
    expect(parsePath("M1e1,2 L-.5,3")).toEqual([
      { cmd: "M", x: 10, y: 2 },
      { cmd: "L", x: -0.5, y: 3 },
    ]);
  });

  it("keeps what it understood when the string is half-typed", () => {
    // Live editing means a truncated path is the normal case, not an error.
    expect(parsePath("M 1 1 L 2 2 C 3")).toEqual([
      { cmd: "M", x: 1, y: 1 },
      { cmd: "L", x: 2, y: 2 },
    ]);
  });

  it("returns nothing for junk", () => {
    expect(parsePath("")).toEqual([]);
    expect(parsePath("not a path")).toEqual([]);
  });
});

describe("serializePath", () => {
  it("round-trips an absolute path unchanged in meaning", () => {
    const d = "M 0 0 C 1 1 2 2 3 3 Q 4 4 5 5 Z";
    expect(serializePath(parsePath(d))).toBe(d);
  });

  it("rounds long decimals rather than emitting float noise", () => {
    expect(serializePath([{ cmd: "M", x: 0.1 + 0.2, y: 1 }])).toBe("M 0.3 1");
  });

  it("keeps arc flags as bare digits", () => {
    const d = "M 0 0 A 5 5 0 1 0 10 10";
    expect(serializePath(parsePath(d))).toBe(d);
  });
});

describe("pathPoints", () => {
  it("lists a cubic's two controls before its anchor", () => {
    const points = pathPoints(parsePath("M 0 0 C 1 1 2 2 3 3"));
    expect(points.map((p) => `${p.seg}${p.slot}`)).toEqual([
      "0p",
      "1c1",
      "1c2",
      "1p",
    ]);
    expect(points[1].kind).toBe("control");
    expect(points[3].kind).toBe("anchor");
  });

  it("skips Z, which has no coordinate to drag", () => {
    const points = pathPoints(parsePath("M 0 0 L 1 1 Z"));
    expect(points).toHaveLength(2);
  });

  it("tethers a cubic's first control to the previous endpoint", () => {
    const segs = parsePath("M 0 0 C 1 1 2 2 3 3");
    const points = pathPoints(segs);
    expect(controlAnchor(segs, points[1])).toEqual({ x: 0, y: 0 });
    expect(controlAnchor(segs, points[2])).toEqual({ x: 3, y: 3 });
    expect(controlAnchor(segs, points[3])).toBeNull();
  });
});

describe("mutation", () => {
  it("moves one anchor and leaves every other point alone", () => {
    const segs = parsePath("M 0 0 L 10 10 L 20 20");
    const moved = movePathPoint(segs, { seg: 1, slot: "p" }, 5, 6);
    expect(moved).toEqual([
      { cmd: "M", x: 0, y: 0 },
      { cmd: "L", x: 5, y: 6 },
      { cmd: "L", x: 20, y: 20 },
    ]);
  });

  it("moves a bezier control without moving its anchor", () => {
    const segs = parsePath("M 0 0 C 1 1 2 2 3 3");
    const moved = movePathPoint(segs, { seg: 1, slot: "c2" }, 9, 9);
    expect(moved[1]).toEqual({
      cmd: "C",
      x1: 1,
      y1: 1,
      x2: 9,
      y2: 9,
      x: 3,
      y: 3,
    });
  });

  it("does not mutate the input array", () => {
    const segs = parsePath("M 0 0 L 1 1");
    const copy = structuredClone(segs);
    movePathPoint(segs, { seg: 1, slot: "p" }, 5, 5);
    translatePath(segs, 3, 3);
    scalePath(segs, 2, 2, 0, 0);
    expect(segs).toEqual(copy);
  });

  it("translates every coordinate, controls included", () => {
    expect(translatePath(parsePath("M 0 0 C 1 1 2 2 3 3"), 10, 20)).toEqual([
      { cmd: "M", x: 10, y: 20 },
      { cmd: "C", x1: 11, y1: 21, x2: 12, y2: 22, x: 13, y: 23 },
    ]);
  });

  it("scales about a pivot and takes arc radii with it", () => {
    const segs = parsePath("M 10 10 A 4 6 0 0 1 20 20");
    const scaled = scalePath(segs, 2, 2, 10, 10);
    expect(scaled[0]).toEqual({ cmd: "M", x: 10, y: 10 });
    expect(scaled[1]).toEqual({
      cmd: "A",
      rx: 8,
      ry: 12,
      rot: 0,
      large: 0,
      sweep: 1,
      x: 30,
      y: 30,
    });
  });

  it("keeps radii positive under a mirrored scale", () => {
    const scaled = scalePath(parsePath("M 0 0 A 4 4 0 0 1 8 8"), -1, 1, 0, 0);
    const arc = scaled[1];
    expect(arc.cmd === "A" && arc.rx).toBe(4);
  });

  it("mapPathString parses, transforms and re-serializes", () => {
    expect(mapPathString("m 1 1 l 2 0", (s) => translatePath(s, 1, 1))).toBe(
      "M 2 2 L 4 2",
    );
  });
});
