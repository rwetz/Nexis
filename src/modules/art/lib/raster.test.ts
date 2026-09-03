// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import {
  exportFileName,
  intrinsicSize,
  needsColorResolution,
  resolveCurrentColor,
} from "./raster";

describe("intrinsicSize", () => {
  it("prefers explicit width and height", () => {
    expect(intrinsicSize('<svg width="48" height="24" viewBox="0 0 24 24"/>')).toEqual({
      width: 48,
      height: 24,
    });
  });

  it("accepts an explicit px unit", () => {
    expect(intrinsicSize('<svg width="48px" height="24px"/>')).toEqual({
      width: 48,
      height: 24,
    });
  });

  it("falls back to the viewBox when there is no usable size", () => {
    expect(intrinsicSize('<svg viewBox="0 0 240 120"/>')).toEqual({
      width: 240,
      height: 120,
    });
  });

  it("ignores a viewBox offset — the size is the last two numbers", () => {
    expect(intrinsicSize('<svg viewBox="-10 -10 40 20"/>')).toEqual({
      width: 40,
      height: 20,
    });
  });

  /**
   * `width="100%"` says nothing about intrinsic size, and reading it as 100
   * would be a silent wrong answer rather than a visible failure.
   */
  it("ignores percentage sizes and uses the viewBox instead", () => {
    expect(
      intrinsicSize('<svg width="100%" height="100%" viewBox="0 0 32 32"/>'),
    ).toEqual({ width: 32, height: 32 });
  });

  it("ignores a unit it cannot convert to canvas pixels", () => {
    expect(intrinsicSize('<svg width="2em" height="2em" viewBox="0 0 16 16"/>'))
      .toEqual({ width: 16, height: 16 });
  });

  /**
   * Both halves of a bug that shipped past the first round of tests here,
   * because every fixture was a bare childless `<svg>` tag. Running the real
   * thing reported a 24-unit icon as 1.5x18 and exported a sliver.
   */
  it("does not read width out of stroke-width", () => {
    expect(
      intrinsicSize('<svg viewBox="0 0 24 24" stroke-width="1.5"/>'),
    ).toEqual({ width: 24, height: 24 });
  });

  it("does not read size from a child element", () => {
    const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
  stroke="currentColor" stroke-width="1.5">
  <rect x="3" y="3" width="18" height="18" rx="4"/>
</svg>`;
    expect(intrinsicSize(icon)).toEqual({ width: 24, height: 24 });
  });

  it("still reads a real width on the root, alongside a stroke-width", () => {
    expect(
      intrinsicSize('<svg width="64" height="64" stroke-width="2" viewBox="0 0 24 24"/>'),
    ).toEqual({ width: 64, height: 64 });
  });

  it("rejects zero and negative sizes", () => {
    expect(intrinsicSize('<svg width="0" height="0" viewBox="0 0 10 10"/>')).toEqual({
      width: 10,
      height: 10,
    });
    expect(intrinsicSize('<svg viewBox="0 0 0 0"/>')).toEqual({
      width: 300,
      height: 150,
    });
  });

  /**
   * The spec's replaced-element default. It is what Chromium actually lays out
   * for a sizeless SVG, so it is what the export has to assume rather than
   * inventing a square.
   */
  it("falls back to 300x150 when the document says nothing", () => {
    expect(intrinsicSize("<svg/>")).toEqual({ width: 300, height: 150 });
  });
});

describe("resolveCurrentColor", () => {
  it("substitutes every occurrence, whatever the casing", () => {
    expect(
      resolveCurrentColor(
        '<path stroke="currentColor" fill="CurrentColor"/>',
        "#ff0000",
      ),
    ).toBe('<path stroke="#ff0000" fill="#ff0000"/>');
  });

  it("does not corrupt a word that merely contains it", () => {
    const svg = '<g id="notcurrentColorish"><path stroke="currentColor"/></g>';
    expect(resolveCurrentColor(svg, "red")).toContain('id="notcurrentColorish"');
    expect(resolveCurrentColor(svg, "red")).toContain('stroke="red"');
  });
});

describe("needsColorResolution", () => {
  /**
   * The whole reason this module takes a colour rather than inferring one: an
   * `<img>`-loaded SVG is an isolated document, so `currentColor` falls back to
   * black and `var(--…)` resolves to nothing. Pitfall #18, from the other side.
   */
  it("flags currentColor and CSS custom properties", () => {
    expect(needsColorResolution('<path stroke="currentColor"/>')).toBe(true);
    expect(needsColorResolution('<path fill="var(--terminal-ansi-red)"/>')).toBe(
      true,
    );
  });

  it("leaves a document that names its own colours alone", () => {
    expect(needsColorResolution('<path fill="#3b82f6"/>')).toBe(false);
  });
});

describe("exportFileName", () => {
  it("keeps a clean stem", () => {
    expect(exportFileName("logo-mark", "svg")).toBe("logo-mark.svg");
  });

  it("collapses anything unsafe in a path segment", () => {
    expect(exportFileName("my icon/v2", "png")).toBe("my-icon-v2.png");
    expect(exportFileName("../../etc/passwd", "svg")).toBe("etc-passwd.svg");
  });

  it("never produces a dotfile or a trailing-dot name", () => {
    expect(exportFileName(".hidden", "svg")).toBe("hidden.svg");
    expect(exportFileName("trailing...", "svg")).toBe("trailing.svg");
  });

  it("falls back rather than producing a bare extension", () => {
    expect(exportFileName("", "png")).toBe("art.png");
    expect(exportFileName("///", "png")).toBe("art.png");
  });

  it("caps the length", () => {
    expect(exportFileName("a".repeat(200), "svg")).toBe(`${"a".repeat(64)}.svg`);
  });
});
