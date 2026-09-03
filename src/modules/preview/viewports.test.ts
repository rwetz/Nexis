// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import {
  layoutViewports,
  VIEWPORTS,
  viewportsById,
  VIEWPORT_GAP,
} from "./viewports";

describe("viewport presets", () => {
  it("uses CSS pixels, not physical device pixels", () => {
    // An iPhone 15 panel is 1179 physical pixels and every media query reads
    // it as 393. A preset built on the physical number tests a layout nobody
    // will ever see, so nothing here should be near those figures.
    const phone = VIEWPORTS.find((v) => v.id === "phone");
    expect(phone).toBeDefined();
    expect(phone!.width).toBeLessThan(500);
    for (const v of VIEWPORTS) expect(v.width).toBeLessThanOrEqual(1440);
  });

  it("has unique ids and ascending widths", () => {
    const ids = VIEWPORTS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    const widths = VIEWPORTS.map((v) => v.width);
    expect([...widths].sort((a, b) => a - b)).toEqual(widths);
  });
});

describe("layoutViewports", () => {
  it("scales every frame by the same factor", () => {
    // Scaling each frame to fill its own column would render a 390px phone
    // and a 1440px desktop at the same on-screen width, destroying the only
    // thing a side-by-side view is for.
    const layout = layoutViewports(1000, 800, VIEWPORTS);
    const ratios = layout.boxes.map((b) => b.width / b.viewport.width);
    for (const r of ratios) expect(r).toBeCloseTo(layout.scale, 10);
    // The phone must still look smaller than the desktop.
    expect(layout.boxes[0].width).toBeLessThan(layout.boxes[2].width);
  });

  it("never scales above 1", () => {
    // Blowing a phone frame up to 2x would misrepresent text size, which is
    // usually the thing being checked.
    const layout = layoutViewports(10_000, 10_000, [VIEWPORTS[0]]);
    expect(layout.scale).toBe(1);
    expect(layout.boxes[0].width).toBe(VIEWPORTS[0].width);
  });

  it("fits within the container on both axes", () => {
    const w = 900;
    const h = 500;
    const layout = layoutViewports(w, h, VIEWPORTS);
    const used =
      layout.boxes.reduce((sum, b) => sum + b.width, 0) +
      VIEWPORT_GAP * (layout.boxes.length + 1);
    expect(used).toBeLessThanOrEqual(w + 0.001);
    for (const b of layout.boxes) {
      expect(b.height).toBeLessThanOrEqual(h + 0.001);
    }
  });

  it("is constrained by height when the pane is short and wide", () => {
    const tall = layoutViewports(5000, 200, VIEWPORTS);
    const tallest = Math.max(...VIEWPORTS.map((v) => v.height));
    // Gaps are rendered pixels: they come off the container before the ratio,
    // rather than being scaled along with the frames.
    expect(tall.scale).toBeCloseTo((200 - VIEWPORT_GAP * 2) / tallest, 10);
  });

  it("gives up rather than overflowing when the pane is smaller than the gaps", () => {
    expect(layoutViewports(10, 10, VIEWPORTS).boxes).toEqual([]);
  });

  it("returns nothing for an empty selection or an unmeasured container", () => {
    expect(layoutViewports(800, 600, []).boxes).toEqual([]);
    // Before the first measurement the container is 0x0; that must not
    // produce a NaN or Infinity scale.
    const unmeasured = layoutViewports(0, 0, VIEWPORTS);
    expect(unmeasured.boxes).toEqual([]);
    expect(Number.isFinite(unmeasured.scale)).toBe(true);
  });

  it("produces a finite scale for every selection", () => {
    for (const v of VIEWPORTS) {
      const layout = layoutViewports(600, 400, [v]);
      expect(Number.isFinite(layout.scale)).toBe(true);
      expect(layout.scale).toBeGreaterThan(0);
    }
  });
});

describe("viewportsById", () => {
  it("resolves ids in the order given", () => {
    const got = viewportsById(["desktop", "phone"]);
    expect(got.map((v) => v.id)).toEqual(["desktop", "phone"]);
  });

  it("drops ids this build does not know", () => {
    // A stored selection from a newer build must not become undefined holes.
    expect(viewportsById(["phone", "watch", "tablet"]).map((v) => v.id)).toEqual(
      ["phone", "tablet"],
    );
    expect(viewportsById([])).toEqual([]);
  });
});
