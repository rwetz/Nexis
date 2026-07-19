// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import {
  clampQuickTerminalHeight,
  isPlausibleAccelerator,
  QUICK_TERMINAL_HEIGHTS,
  QUICK_TERMINAL_MAX_HEIGHT,
  QUICK_TERMINAL_MIN_HEIGHT,
  quickTerminalGeometry,
} from "./quickTerminalConfig";

const monitor = (over: Partial<Parameters<typeof quickTerminalGeometry>[0]>) => ({
  position: { x: 0, y: 0 },
  size: { width: 1920, height: 1080 },
  scaleFactor: 1,
  ...over,
});

describe("quickTerminalGeometry", () => {
  it("spans the monitor width and drops from its top edge", () => {
    const geo = quickTerminalGeometry(monitor({}), 0.4);
    expect(geo).toEqual({ x: 0, y: 0, width: 1920, height: 432 });
  });

  it("converts physical monitor pixels to logical ones", () => {
    // The whole point of the scale divide: on a 2x display the monitor reports
    // 3840x2160, but setSize/setPosition take logical units. Without this the
    // window would be sized twice the screen.
    const geo = quickTerminalGeometry(
      monitor({ size: { width: 3840, height: 2160 }, scaleFactor: 2 }),
      0.5,
    );
    expect(geo).toEqual({ x: 0, y: 0, width: 1920, height: 540 });
  });

  it("anchors to a secondary monitor's own origin", () => {
    const geo = quickTerminalGeometry(
      monitor({ position: { x: 1920, y: -200 } }),
      0.4,
    );
    expect(geo.x).toBe(1920);
    expect(geo.y).toBe(-200);
  });

  it("scales a secondary monitor's origin too", () => {
    const geo = quickTerminalGeometry(
      monitor({ position: { x: 3840, y: 0 }, scaleFactor: 2 }),
      0.4,
    );
    expect(geo.x).toBe(1920);
  });

  it("clamps out-of-range and non-finite height fractions", () => {
    expect(quickTerminalGeometry(monitor({}), 5).height).toBe(
      1080 * QUICK_TERMINAL_MAX_HEIGHT,
    );
    expect(quickTerminalGeometry(monitor({}), 0.01).height).toBe(
      1080 * QUICK_TERMINAL_MIN_HEIGHT,
    );
    expect(quickTerminalGeometry(monitor({}), Number.NaN).height).toBe(1080 * 0.4);
  });

  it("treats a zero/absent scale factor as 1 rather than dividing by zero", () => {
    const geo = quickTerminalGeometry(monitor({ scaleFactor: 0 }), 0.4);
    expect(geo.width).toBe(1920);
    expect(Number.isFinite(geo.height)).toBe(true);
  });
});

describe("clampQuickTerminalHeight", () => {
  it("keeps every offered preset unchanged", () => {
    // A preset the clamp would rewrite is a settings dropdown that silently
    // disagrees with what it saved.
    for (const h of QUICK_TERMINAL_HEIGHTS)
      expect(clampQuickTerminalHeight(h)).toBe(h);
  });
});

describe("isPlausibleAccelerator", () => {
  it("accepts modifier+key chords", () => {
    expect(isPlausibleAccelerator("Control+Shift+Backquote")).toBe(true);
    expect(isPlausibleAccelerator("Command+Shift+Backquote")).toBe(true);
    expect(isPlausibleAccelerator("CommandOrControl+T")).toBe(true);
  });

  it("rejects a bare key — it would swallow that key system-wide", () => {
    expect(isPlausibleAccelerator("Backquote")).toBe(false);
    expect(isPlausibleAccelerator("F1")).toBe(false);
  });

  it("rejects modifiers with no key", () => {
    expect(isPlausibleAccelerator("Control+Shift")).toBe(false);
    expect(isPlausibleAccelerator("Control+")).toBe(false);
  });

  it("rejects a non-modifier in a modifier position", () => {
    expect(isPlausibleAccelerator("Ctrl+A+B")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(isPlausibleAccelerator("")).toBe(false);
    expect(isPlausibleAccelerator("+")).toBe(false);
  });
});
