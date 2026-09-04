// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import {
  ASPECTS,
  defaultSceneValues,
  renderScene,
  rollSeed,
  sceneById,
  SCENES,
  type SceneContext,
  type SceneDef,
} from "./scenes";
import { looksLikeSvg } from "./svgExport";
import { optimizeSvg } from "./svgOptimize";
import { sanitizeSvgForPreview } from "./svgSanitize";
import { intrinsicSize } from "./raster";

const PALETTE = ["#0f172a", "#1e3a8a", "#3b82f6", "#93c5fd"];

function ctx(scene: SceneDef, over: Partial<SceneContext> = {}): SceneContext {
  return {
    values: defaultSceneValues(scene),
    palette: PALETTE,
    background: "#020617",
    width: 1920,
    height: 1080,
    ...over,
  };
}

describe("scene registry", () => {
  it("has unique ids, a label, and parameters", () => {
    const ids = SCENES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const scene of SCENES) {
      expect(scene.label, scene.id).toBeTruthy();
      expect(scene.params.length, scene.id).toBeGreaterThan(0);
    }
  });

  it("gives every parameter a default inside its own range", () => {
    for (const scene of SCENES) {
      for (const p of scene.params) {
        expect(p.default, `${scene.id}.${p.key}`).toBeGreaterThanOrEqual(p.min);
        expect(p.default, `${scene.id}.${p.key}`).toBeLessThanOrEqual(p.max);
        expect(p.step, `${scene.id}.${p.key}`).toBeGreaterThan(0);
        expect(p.min).toBeLessThan(p.max);
      }
    }
  });

  it("seeds every generator that uses randomness", () => {
    // Not every scene is random — `steps` is fully determined — but any that
    // is must expose the seed, or its preview and its export disagree.
    for (const scene of SCENES) {
      const keys = scene.params.map((p) => p.key);
      const body = scene.body.toString();
      if (body.includes("rng(")) {
        expect(keys, `${scene.id} uses rng but has no seed`).toContain("seed");
      }
    }
  });

  it("resolves by id", () => {
    expect(sceneById("peaks")?.id).toBe("peaks");
    expect(sceneById("nope")).toBeUndefined();
  });
});

describe("every scene's output", () => {
  it("is a complete SVG document the rest of the pack accepts", () => {
    for (const scene of SCENES) {
      const svg = renderScene(scene, ctx(scene));
      expect(looksLikeSvg(svg), `${scene.id} is not a document`).toBe(true);
      expect(svg, scene.id).toContain("viewBox");
    }
  });

  it("matches the requested aspect exactly", () => {
    for (const scene of SCENES) {
      for (const aspect of ASPECTS) {
        const svg = renderScene(
          scene,
          ctx(scene, { width: aspect.width, height: aspect.height }),
        );
        expect(intrinsicSize(svg), `${scene.id} at ${aspect.id}`).toEqual({
          width: aspect.width,
          height: aspect.height,
        });
      }
    }
  });

  it("is clean under the preview sanitizer", () => {
    for (const scene of SCENES) {
      const { removed } = sanitizeSvgForPreview(renderScene(scene, ctx(scene)));
      expect(removed, `${scene.id} produced markup the sanitizer strips`).toEqual(
        [],
      );
    }
  });

  it("survives the optimizer", () => {
    for (const scene of SCENES) {
      const { svg } = optimizeSvg(renderScene(scene, ctx(scene)));
      expect(looksLikeSvg(svg), `${scene.id} broke when optimized`).toBe(true);
    }
  });

  /**
   * The property the whole pack rests on. A generator that rolls fresh
   * randomness per call disagrees with its own export and rerolls the form
   * every time a slider moves.
   */
  it("is deterministic for a given seed", () => {
    for (const scene of SCENES) {
      const a = renderScene(scene, ctx(scene));
      const b = renderScene(scene, ctx(scene));
      expect(a, `${scene.id} is not deterministic`).toBe(b);
    }
  });

  it("actually changes when the seed changes", () => {
    for (const scene of SCENES) {
      if (!scene.body.toString().includes("rng(")) continue;
      const values = defaultSceneValues(scene);
      const a = renderScene(scene, ctx(scene, { values: { ...values, seed: 1 } }));
      const b = renderScene(scene, ctx(scene, { values: { ...values, seed: 2 } }));
      expect(a, `${scene.id} ignores its seed`).not.toBe(b);
    }
  });

  it("draws only colours from the palette it was given", () => {
    for (const scene of SCENES) {
      const svg = renderScene(scene, ctx(scene, { background: null }));
      const hexes = svg.match(/#[0-9a-f]{6}/gi) ?? [];
      for (const hex of hexes) {
        expect(
          PALETTE.map((c) => c.toLowerCase()),
          `${scene.id} invented ${hex}`,
        ).toContain(hex.toLowerCase());
      }
    }
  });

  it("paints the background as a real rect, not a style", () => {
    // The export is a file: a backdrop whose background exists only in the
    // panel that made it is not a backdrop.
    const scene = SCENES[0];
    expect(renderScene(scene, ctx(scene, { background: "#123456" }))).toContain(
      'fill="#123456"',
    );
    expect(
      renderScene(scene, ctx(scene, { background: null })),
    ).not.toContain("#123456");
  });

  it("survives a single-colour palette and extreme parameters", () => {
    for (const scene of SCENES) {
      const values = defaultSceneValues(scene);
      for (const p of scene.params) {
        for (const bound of [p.min, p.max]) {
          const svg = renderScene(
            scene,
            ctx(scene, {
              values: { ...values, [p.key]: bound },
              palette: ["#ffffff"],
            }),
          );
          expect(
            looksLikeSvg(svg),
            `${scene.id} broke at ${p.key}=${bound}`,
          ).toBe(true);
          expect(svg, `${scene.id} emitted NaN at ${p.key}=${bound}`).not.toContain(
            "NaN",
          );
        }
      }
    }
  });
});

describe("aspects", () => {
  it("are all positive and uniquely identified", () => {
    const ids = ASPECTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ASPECTS) {
      expect(a.width).toBeGreaterThan(0);
      expect(a.height).toBeGreaterThan(0);
      expect(a.label).toBeTruthy();
    }
  });
});

describe("rollSeed", () => {
  it("stays inside the range every scene's seed slider accepts", () => {
    for (let i = 0; i < 200; i++) {
      const seed = rollSeed();
      expect(seed).toBeGreaterThanOrEqual(1);
      expect(seed).toBeLessThanOrEqual(9999);
      expect(Number.isInteger(seed)).toBe(true);
    }
  });
});
