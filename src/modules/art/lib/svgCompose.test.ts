// @vitest-environment jsdom
// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import {
  composeSvg,
  countPieces,
  nextSlot,
  readViewBox,
} from "./svgCompose";

const HOST = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"></svg>`;

/** Art that defines an id and references it — the collision case. */
const GRADIENT_ART = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
  <defs><linearGradient id="a"><stop offset="0" stop-color="#f00"/></linearGradient></defs>
  <rect width="10" height="10" fill="url(#a)"/>
</svg>`;

describe("readViewBox", () => {
  it("reads an explicit viewBox", () => {
    const el = new DOMParser().parseFromString(
      `<svg viewBox="1 2 30 40"/>`,
      "image/svg+xml",
    ).documentElement;
    expect(readViewBox(el)).toEqual({ x: 1, y: 2, width: 30, height: 40 });
  });

  it("falls back to width/height when there is no viewBox", () => {
    const el = new DOMParser().parseFromString(
      `<svg width="64" height="48"/>`,
      "image/svg+xml",
    ).documentElement;
    expect(readViewBox(el)).toEqual({ x: 0, y: 0, width: 64, height: 48 });
  });
});

describe("composeSvg", () => {
  it("places art as a labelled group instead of replacing the document", () => {
    const first = composeSvg(HOST, GRADIENT_ART, nextSlot(readViewBox(
      new DOMParser().parseFromString(HOST, "image/svg+xml").documentElement,
    ), 0), "preset");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(countPieces(first.svg)).toBe(1);
    expect(first.svg).toContain('data-nexis-piece="preset"');
  });

  it("keeps both pieces when a second is added", () => {
    const box = readViewBox(
      new DOMParser().parseFromString(HOST, "image/svg+xml").documentElement,
    );
    const first = composeSvg(HOST, GRADIENT_ART, nextSlot(box, 0));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = composeSvg(first.svg, GRADIENT_ART, nextSlot(box, 1));
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(countPieces(second.svg)).toBe(2);
  });

  /**
   * The defect this function exists to prevent. Two copies of art that both
   * define `id="a"` would leave every `url(#a)` pointing at whichever
   * gradient came last, so the first piece would silently repaint itself in
   * the second's colours.
   */
  it("namespaces incoming ids so two pieces cannot share one gradient", () => {
    const box = readViewBox(
      new DOMParser().parseFromString(HOST, "image/svg+xml").documentElement,
    );
    const first = composeSvg(HOST, GRADIENT_ART, nextSlot(box, 0));
    if (!first.ok) throw new Error("first compose failed");
    const second = composeSvg(first.svg, GRADIENT_ART, nextSlot(box, 1));
    if (!second.ok) throw new Error("second compose failed");

    const ids = [...second.svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    // And every reference still resolves to an id that exists.
    for (const [, ref] of second.svg.matchAll(/url\(#([^)]+)\)/g)) {
      expect(ids).toContain(ref);
    }
  });

  it("does not carry document-level attributes onto the group", () => {
    const box = readViewBox(
      new DOMParser().parseFromString(HOST, "image/svg+xml").documentElement,
    );
    const out = composeSvg(HOST, GRADIENT_ART, nextSlot(box, 0));
    if (!out.ok) throw new Error("compose failed");
    // The host keeps exactly one viewBox: the incoming root's must not have
    // ridden along onto the <g>.
    expect([...out.svg.matchAll(/viewBox=/g)]).toHaveLength(1);
  });

  it("scales uniformly to fit the slot", () => {
    // 10x10 art into a 300x300 canvas, 3x3 grid => 100x100 cell less inset.
    const box = { x: 0, y: 0, width: 300, height: 300 };
    const out = composeSvg(HOST, GRADIENT_ART, nextSlot(box, 0));
    if (!out.ok) throw new Error("compose failed");
    const scale = /scale\(([\d.]+)\)/.exec(out.svg);
    expect(scale).not.toBeNull();
    // Cell is 100 wide with a 10 inset each side => 80 / 10 units = 8.
    expect(Number(scale?.[1])).toBeCloseTo(8, 3);
  });

  it("reports a reason rather than throwing on invalid input", () => {
    const out = composeSvg(HOST, "<not-svg>", { x: 0, y: 0, width: 1, height: 1 });
    expect(out.ok).toBe(false);
  });
});

describe("nextSlot", () => {
  it("walks a grid so pieces do not stack on one another", () => {
    const box = { x: 0, y: 0, width: 300, height: 300 };
    const a = nextSlot(box, 0);
    const b = nextSlot(box, 1);
    const d = nextSlot(box, 3);
    expect(b.x).toBeGreaterThan(a.x);
    expect(b.y).toBe(a.y);
    // Fourth piece wraps to the next row.
    expect(d.y).toBeGreaterThan(a.y);
  });
});
