// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import {
  auditIcons,
  readIconFacts,
  summarize,
  type IconFile,
} from "./iconAudit";

const icon = (name: string, attrs: string, body = '<path d="M0 0 L1 1"/>'): IconFile => ({
  name,
  source: `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`,
});

const facts = (files: IconFile[]) => files.map(readIconFacts);

describe("readIconFacts", () => {
  it("reads the canvas from a square viewBox", () => {
    const f = readIconFacts(icon("a.svg", 'viewBox="0 0 24 24"'));
    expect(f.viewBox).toEqual([0, 0, 24, 24]);
    expect(f.canvas).toBe(24);
    expect(f.error).toBeNull();
  });

  it("reports a non-square viewBox as having no canvas size", () => {
    expect(readIconFacts(icon("a.svg", 'viewBox="0 0 32 16"')).canvas).toBeNull();
  });

  it("collects distinct stroke widths, sorted", () => {
    const f = readIconFacts(
      icon(
        "a.svg",
        'viewBox="0 0 24 24" stroke-width="1.5"',
        '<path stroke-width="2"/><path stroke-width="1.5"/>',
      ),
    );
    expect(f.strokeWidths).toEqual([1.5, 2]);
  });

  it("separates literal colours from currentColor and none", () => {
    const f = readIconFacts(
      icon(
        "a.svg",
        'viewBox="0 0 24 24" fill="none"',
        '<path stroke="currentColor"/><path fill="#ff0000"/>',
      ),
    );
    expect(f.literalColors).toEqual(["#ff0000"]);
    expect(f.usesCurrentColor).toBe(true);
  });

  /**
   * These are files on someone's disk, not this app's output. One bad export
   * must not cost the report on the other forty.
   */
  it("reports an unreadable file rather than throwing", () => {
    const f = readIconFacts({ name: "bad.svg", source: "not markup at all" });
    expect(f.error).toBe("no <svg> root element");
    expect(f.canvas).toBeNull();
  });

  it("does not read stroke-width as width", () => {
    // The same hyphen-is-a-word-boundary trap that bit the raster sizer.
    const f = readIconFacts(icon("a.svg", 'viewBox="0 0 24 24" stroke-width="1.5"'));
    expect(f.canvas).toBe(24);
  });
});

describe("auditIcons", () => {
  it("says nothing about a consistent set", () => {
    const set = facts([
      icon("a.svg", 'viewBox="0 0 24 24" stroke-width="1.5"', '<path stroke="currentColor"/>'),
      icon("b.svg", 'viewBox="0 0 24 24" stroke-width="1.5"', '<path stroke="currentColor"/>'),
    ]);
    expect(auditIcons(set)).toEqual([]);
  });

  /**
   * The finding pitfall #18 is about: 13 pixel sizes and 12 stroke weights,
   * accumulated one harmless-looking addition at a time.
   */
  it("flags mixed canvas sizes and names the minority", () => {
    const set = facts([
      icon("a.svg", 'viewBox="0 0 24 24"'),
      icon("b.svg", 'viewBox="0 0 24 24"'),
      icon("odd.svg", 'viewBox="0 0 16 16"'),
    ]);
    const finding = auditIcons(set).find((f) => f.kind === "canvas-size");
    expect(finding).toBeTruthy();
    expect(finding!.message).toContain("2 of 3 use 24");
    expect(finding!.files).toEqual(["odd.svg (16)"]);
  });

  it("flags mixed stroke widths and names the minority", () => {
    const set = facts([
      icon("a.svg", 'viewBox="0 0 24 24" stroke-width="1.5"'),
      icon("b.svg", 'viewBox="0 0 24 24" stroke-width="1.5"'),
      icon("heavy.svg", 'viewBox="0 0 24 24" stroke-width="2"'),
    ]);
    const finding = auditIcons(set).find((f) => f.kind === "stroke-width");
    expect(finding!.message).toContain("2 of 3 use 1.5");
    expect(finding!.files).toEqual(["heavy.svg (2)"]);
  });

  it("flags baked-in colour only when the rest of the set is themeable", () => {
    const mixed = facts([
      icon("a.svg", 'viewBox="0 0 24 24"', '<path stroke="currentColor"/>'),
      icon("brand.svg", 'viewBox="0 0 24 24"', '<path fill="#ff0000"/>'),
    ]);
    expect(auditIcons(mixed).some((f) => f.kind === "literal-color")).toBe(true);

    // A set that is *entirely* literal-coloured is a set of brand marks, and
    // recolouring a logo is a wrong logo (pitfall #18). Not a finding.
    const allBrand = facts([
      icon("a.svg", 'viewBox="0 0 24 24"', '<path fill="#ff0000"/>'),
      icon("b.svg", 'viewBox="0 0 24 24"', '<path fill="#00ff00"/>'),
    ]);
    expect(auditIcons(allBrand).some((f) => f.kind === "literal-color")).toBe(false);
  });

  it("flags a missing viewBox", () => {
    const set = facts([icon("a.svg", 'width="24" height="24"')]);
    expect(auditIcons(set).some((f) => f.kind === "missing-viewbox")).toBe(true);
  });

  it("flags a non-square canvas", () => {
    const set = facts([icon("wide.svg", 'viewBox="0 0 32 16"')]);
    expect(auditIcons(set).some((f) => f.kind === "non-square")).toBe(true);
  });

  it("reports unreadable files and still audits the rest", () => {
    const set = [
      ...facts([
        icon("a.svg", 'viewBox="0 0 24 24"'),
        icon("b.svg", 'viewBox="0 0 24 24"'),
        icon("odd.svg", 'viewBox="0 0 16 16"'),
      ]),
      readIconFacts({ name: "broken.svg", source: "<<<" }),
    ];
    const kinds = auditIcons(set).map((f) => f.kind);
    expect(kinds).toContain("unreadable");
    expect(kinds).toContain("canvas-size");
  });

  it("handles an empty folder without inventing findings", () => {
    expect(auditIcons([])).toEqual([]);
  });
});

describe("summarize", () => {
  it("describes a consistent set in one line", () => {
    const set = facts([
      icon("a.svg", 'viewBox="0 0 24 24" stroke-width="1.5"'),
      icon("b.svg", 'viewBox="0 0 24 24" stroke-width="1.5"'),
    ]);
    expect(summarize(set)).toBe("2 icons - 24px canvas - 1.5 stroke");
  });

  it("counts the variants when a set has drifted", () => {
    const set = facts([
      icon("a.svg", 'viewBox="0 0 24 24" stroke-width="1.5"'),
      icon("b.svg", 'viewBox="0 0 16 16" stroke-width="2"'),
    ]);
    expect(summarize(set)).toBe("2 icons - 2 canvas sizes - 2 stroke widths");
  });

  it("says so when nothing could be read", () => {
    expect(summarize([readIconFacts({ name: "x", source: "" })])).toBe(
      "No readable SVGs",
    );
  });
});
