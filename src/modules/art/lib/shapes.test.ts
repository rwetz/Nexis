// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import { looksLikeSvg } from "./svgExport";
import { optimizeSvg } from "./svgOptimize";
import { sanitizeSvgForPreview } from "./svgSanitize";
import { defaultValues, shapeById, SHAPES } from "./shapes";

describe("shape registry", () => {
  it("has unique ids and at least one parameter each", () => {
    const ids = SHAPES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const shape of SHAPES) {
      expect(shape.params.length).toBeGreaterThan(0);
      expect(shape.label).toBeTruthy();
    }
  });

  it("gives every parameter a default inside its own range", () => {
    // A default outside the range renders a slider that jumps on first touch.
    for (const shape of SHAPES) {
      for (const p of shape.params) {
        expect(p.default).toBeGreaterThanOrEqual(p.min);
        expect(p.default).toBeLessThanOrEqual(p.max);
        expect(p.step).toBeGreaterThan(0);
        expect(p.min).toBeLessThan(p.max);
      }
    }
  });

  it("resolves shapes by id", () => {
    expect(shapeById("blob")?.id).toBe("blob");
    expect(shapeById("nope")).toBeUndefined();
  });

  it("builds defaults covering every parameter key", () => {
    for (const shape of SHAPES) {
      const v = defaultValues(shape);
      for (const p of shape.params) expect(v[p.key]).toBe(p.default);
    }
  });
});

describe("every generator's output", () => {
  it("is a complete SVG document the rest of the pack accepts", () => {
    // The generators feed the playground's existing editor, so their output
    // has to satisfy the same gate the editor uses.
    for (const shape of SHAPES) {
      const svg = shape.render(defaultValues(shape));
      expect(looksLikeSvg(svg), `${shape.id} is not a complete document`).toBe(
        true,
      );
      expect(svg).toContain("viewBox");
    }
  });

  it("survives the optimizer without breaking", () => {
    for (const shape of SHAPES) {
      const svg = shape.render(defaultValues(shape));
      const { svg: optimized } = optimizeSvg(svg);
      expect(looksLikeSvg(optimized), `${shape.id} broke when optimized`).toBe(
        true,
      );
    }
  });

  it("is clean under the preview sanitizer", () => {
    // Generated markup must never trip the guard -- if it did, the preview
    // would silently render something different from the source.
    for (const shape of SHAPES) {
      const { removed } = sanitizeSvgForPreview(
        shape.render(defaultValues(shape)),
      );
      expect(removed, `${shape.id} produced markup the sanitizer strips`).toEqual(
        [],
      );
    }
  });

  it("emits no runaway floating point", () => {
    // `0.30000000000000004` in path data is both ugly and needlessly large.
    for (const shape of SHAPES) {
      const svg = shape.render(defaultValues(shape));
      expect(svg, `${shape.id} leaked a long float`).not.toMatch(/\d\.\d{5,}/);
    }
  });

  it("contains no NaN at any point in a parameter's range", () => {
    // A NaN in path data renders as nothing at all, silently.
    for (const shape of SHAPES) {
      for (const p of shape.params) {
        for (const value of [p.min, p.default, p.max]) {
          const svg = shape.render({ ...defaultValues(shape), [p.key]: value });
          expect(
            svg,
            `${shape.id} produced NaN with ${p.key}=${value}`,
          ).not.toContain("NaN");
        }
      }
    }
  });
});

describe("determinism", () => {
  it("returns identical markup for identical parameters", () => {
    // The whole reason seeds are parameters: a generator that called
    // Math.random() would make the preview disagree with the export and
    // reroll the shape every time an unrelated slider moved.
    for (const shape of SHAPES) {
      const v = defaultValues(shape);
      expect(shape.render(v)).toBe(shape.render(v));
    }
  });

  it("changes the blob when the seed changes, and only then", () => {
    const blob = shapeById("blob")!;
    const base = defaultValues(blob);
    expect(blob.render({ ...base, seed: 1 })).not.toBe(
      blob.render({ ...base, seed: 2 })
    );
    expect(blob.render({ ...base, seed: 1 })).toBe(
      blob.render({ ...base, seed: 1 })
    );
  });

  it("keeps the grain seed inside the markup, not in a call to random", () => {
    const grain = shapeById("grain")!;
    const base = defaultValues(grain);
    expect(grain.render({ ...base, seed: 5 })).toContain('seed="5"');
    expect(grain.render({ ...base, seed: 5 })).toBe(
      grain.render({ ...base, seed: 5 }),
    );
  });
});

describe("shape-specific correctness", () => {
  it("closes the blob path", () => {
    const blob = shapeById("blob")!;
    expect(blob.render(defaultValues(blob))).toMatch(/Z"/);
  });

  it("puts every zero-variance blob point exactly on the radius", () => {
    // variance 0 must be a circle. Only the LAST coordinate pair of each `C`
    // is on the curve -- the first two are bezier control points, and
    // averaging those in is what made the first version of this test wrong.
    const blob = shapeById("blob")!;
    const radius = 84;
    const svg = blob.render({
      ...defaultValues(blob),
      variance: 0,
      points: 8,
      radius,
    });
    const d = /d="([^"]+)"/.exec(svg)?.[1] ?? "";
    const onCurve = [
      ...d.matchAll(/C [^,]+,[^,]+,\s*(-?[\d.]+) (-?[\d.]+)/g),
    ].map((m) => [Number(m[1]), Number(m[2])] as const);

    expect(onCurve).toHaveLength(8);
    for (const [x, y] of onCurve) {
      const dist = Math.hypot(x - 120, y - 120);
      expect(Math.abs(dist - radius)).toBeLessThan(0.05);
    }
  });

  it("sets the large-arc flag past a half turn", () => {
    // Without it, every sweep over 180 degrees silently draws the short way.
    const arc = shapeById("arc")!;
    const base = defaultValues(arc);
    expect(arc.render({ ...base, sweep: 90 })).toMatch(/A [\d.]+ [\d.]+ 0 0 1/);
    expect(arc.render({ ...base, sweep: 300 })).toMatch(/A [\d.]+ [\d.]+ 0 1 1/);
  });

  it("closes the filled wave back along the bottom edge", () => {
    const fill = shapeById("wave-fill")!;
    const svg = fill.render(defaultValues(fill));
    expect(svg).toMatch(/L 240 240 L 0 240 Z/);
    expect(svg).toContain('fill="currentColor"');
  });

  it("draws the divider as curves or as straight segments on demand", () => {
    const divider = shapeById("divider")!;
    const base = defaultValues(divider);
    expect(divider.render({ ...base, round: 1 })).toContain(" Q ");
    expect(divider.render({ ...base, round: 0 })).not.toContain(" Q ");
  });

  it("uses currentColor so generated art inherits the theme", () => {
    // No exemptions. Grain gets there the hard way: raw feTurbulence is
    // opaque RGB static that ignores fill, so it is converted to an alpha
    // mask and composited against a currentColor rect.
    for (const shape of SHAPES) {
      const svg = shape.render(defaultValues(shape));
      expect(svg, `${shape.id} hardcodes a colour`).toContain("currentColor");
    }
  });

  it("masks the grain rather than painting turbulence directly", () => {
    const grain = shapeById("grain")!;
    const svg = grain.render(defaultValues(grain));
    expect(svg).toContain("feColorMatrix");
    expect(svg).toContain('operator="in"');
    expect(svg).toContain('fill="currentColor"');
  });
});
