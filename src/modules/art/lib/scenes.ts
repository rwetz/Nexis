// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Scene generators: the full-bleed, colourful, layered half of the Art pack.
 *
 * `ShapeDef` could not express these, and the three reasons are the whole
 * design of this module:
 *
 * - **Colour.** Every shape generator emits `currentColor` so its art takes
 *   the theme. A backdrop is *about* its colours, so a scene takes a palette.
 * - **Aspect.** Shapes are a 240 square. A backdrop is 16:9 or 9:16 or square,
 *   and a wave that does not know its own width cannot span it.
 * - **Layers.** A `ShapeDef` is one function to one document. The generators
 *   worth having here — stacked waves, layered peaks — *are* the stack.
 *
 * Everything else is deliberately unchanged from `shapes.ts`: a scene is still
 * a **pure function from numbers to a complete SVG document**, randomness is
 * still seeded, and the output still drops into the same optimizer, sanitizer,
 * preview and exporter as anything else the pack makes.
 *
 * ## Depth is painted, not composited
 *
 * Layered generators shade each layer by walking the palette rather than by
 * stacking translucent fills. Opacity stacking looks equivalent and is not: it
 * makes every layer depend on what is under it, so the top of a ten-layer wave
 * ends up muddy and the palette stops meaning anything. Sampling the palette
 * keeps each band a colour somebody actually chose.
 */

import {
  closedPath,
  defaultsFor,
  n,
  polar,
  rng,
  smoothClosedPath,
  smoothOpenPath,
  type ParamSpec,
} from "./generative";

export type { ParamSpec };

/** Canvas proportions worth having as one click. */
export type Aspect = { id: string; label: string; width: number; height: number };

export const ASPECTS: readonly Aspect[] = [
  { id: "wide", label: "16:9", width: 1920, height: 1080 },
  { id: "square", label: "1:1", width: 1200, height: 1200 },
  { id: "tall", label: "9:16", width: 1080, height: 1920 },
  { id: "banner", label: "3:1", width: 1500, height: 500 },
];

export type SceneContext = {
  values: Record<string, number>;
  /** At least one colour; callers guarantee it. */
  palette: readonly string[];
  /** Painted as a full-bleed rect first. Null leaves the canvas transparent. */
  background: string | null;
  width: number;
  height: number;
};

export type SceneDef = {
  id: string;
  label: string;
  params: readonly ParamSpec[];
  /** Body markup only — `renderScene` wraps it in the document. */
  body: (ctx: SceneContext) => string;
};

/** Seed is a parameter on every scene, for the reason `generative.ts` gives. */
const SEED: ParamSpec = {
  key: "seed",
  label: "Seed",
  min: 1,
  max: 9999,
  step: 1,
  default: 7,
  hint: "Same seed, same scene",
};

/**
 * Walk the palette across `count` steps.
 *
 * Wrapping rather than clamping matters: a four-colour palette across ten
 * layers should cycle through the colours, not paint six identical bands at
 * the end and look like a bug.
 */
function ramp(palette: readonly string[], i: number, count: number): string {
  if (palette.length === 0) return "#888888";
  if (count <= 1) return palette[0];
  const t = i / (count - 1);
  const idx = Math.round(t * (palette.length - 1));
  return palette[Math.min(palette.length - 1, Math.max(0, idx))];
}

// ── The registry ────────────────────────────────────────────────────────────

export const SCENES: readonly SceneDef[] = [
  {
    id: "layered-waves",
    label: "Layered waves",
    params: [
      { key: "layers", label: "Layers", min: 2, max: 14, step: 1, default: 6 },
      { key: "amplitude", label: "Amplitude", min: 0, max: 0.3, step: 0.005, default: 0.09, hint: "As a fraction of the height" },
      { key: "frequency", label: "Frequency", min: 0.4, max: 5, step: 0.1, default: 1.1 },
      { key: "variance", label: "Variance", min: 0, max: 1, step: 0.01, default: 0.45, hint: "How much each layer differs" },
      SEED,
    ],
    body: (ctx) => {
      const { width: w, height: h, values: v } = ctx;
      const count = Math.max(2, Math.round(v.layers));
      const rand = rng(v.seed);
      const out: string[] = [];
      // Back to front, so a later layer paints over the one behind it. Each
      // band's baseline steps down the canvas; the last one reaches the floor.
      for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        const baseline = h * (0.28 + t * 0.72);
        const amp = h * v.amplitude * (1 - t * 0.4);
        const phase = rand() * Math.PI * 2;
        const freq = v.frequency * (1 + (rand() - 0.5) * v.variance);
        const pts: [number, number][] = [];
        const samples = 24;
        for (let s = 0; s <= samples; s++) {
          const x = (s / samples) * w;
          const y = baseline + Math.sin((s / samples) * Math.PI * 2 * freq + phase) * amp;
          pts.push([x, y]);
        }
        const d = `${smoothOpenPath(pts)} L ${n(w)} ${n(h)} L 0 ${n(h)} Z`;
        out.push(`  <path d="${d}" fill="${ramp(ctx.palette, i, count)}" />`);
      }
      return out.join("\n");
    },
  },

  {
    id: "peaks",
    label: "Peaks",
    params: [
      { key: "ridges", label: "Ridges", min: 1, max: 8, step: 1, default: 4 },
      { key: "roughness", label: "Roughness", min: 1, max: 12, step: 1, default: 5, hint: "Points per ridge" },
      { key: "height", label: "Height", min: 0.1, max: 0.8, step: 0.01, default: 0.42 },
      { key: "jitter", label: "Jitter", min: 0, max: 1, step: 0.01, default: 0.55 },
      SEED,
    ],
    body: (ctx) => {
      const { width: w, height: h, values: v } = ctx;
      const count = Math.max(1, Math.round(v.ridges));
      const rand = rng(v.seed);
      const out: string[] = [];
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0 : i / (count - 1);
        const base = h * (0.45 + t * 0.55);
        const peak = h * v.height * (1 - t * 0.35);
        const steps = Math.max(2, Math.round(v.roughness));
        const pts: [number, number][] = [[0, base]];
        for (let s = 1; s <= steps; s++) {
          const x = (s / steps) * w;
          // A ridge is a run of peaks, so odd samples rise and even ones fall;
          // the jitter is applied to the rise so a ridge is not a sawtooth.
          const rise = s % 2 === 1 ? peak * (1 - rand() * v.jitter) : peak * 0.15 * rand();
          pts.push([x, base - rise]);
        }
        pts.push([w, base]);
        const d = `${pts.map(([x, y], k) => `${k === 0 ? "M" : "L"} ${n(x)} ${n(y)}`).join(" ")} L ${n(w)} ${n(h)} L 0 ${n(h)} Z`;
        out.push(`  <path d="${d}" fill="${ramp(ctx.palette, i, count)}" />`);
      }
      return out.join("\n");
    },
  },

  {
    id: "blob-scene",
    label: "Blob scene",
    params: [
      { key: "count", label: "Blobs", min: 1, max: 14, step: 1, default: 5 },
      { key: "size", label: "Size", min: 0.05, max: 0.6, step: 0.01, default: 0.28, hint: "Of the shorter side" },
      { key: "variance", label: "Wobble", min: 0, max: 0.6, step: 0.01, default: 0.28 },
      { key: "spread", label: "Spread", min: 0.2, max: 1.4, step: 0.01, default: 0.9 },
      SEED,
    ],
    body: (ctx) => {
      const { width: w, height: h, values: v } = ctx;
      const count = Math.max(1, Math.round(v.count));
      const rand = rng(v.seed);
      const short = Math.min(w, h);
      const out: string[] = [];
      for (let i = 0; i < count; i++) {
        const cx = w / 2 + (rand() - 0.5) * w * v.spread;
        const cy = h / 2 + (rand() - 0.5) * h * v.spread;
        const radius = short * v.size * (0.55 + rand() * 0.9);
        const pts: [number, number][] = [];
        const points = 8;
        for (let k = 0; k < points; k++) {
          const angle = (k / points) * Math.PI * 2;
          const r = radius * (1 + (rand() - 0.5) * 2 * v.variance);
          pts.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
        }
        out.push(
          `  <path d="${smoothClosedPath(pts)}" fill="${ramp(ctx.palette, i, count)}" />`,
        );
      }
      return out.join("\n");
    },
  },

  {
    id: "scatter",
    label: "Scatter",
    params: [
      { key: "count", label: "Count", min: 5, max: 400, step: 1, default: 90 },
      { key: "size", label: "Size", min: 1, max: 60, step: 1, default: 14 },
      { key: "variance", label: "Size variance", min: 0, max: 1, step: 0.01, default: 0.7 },
      { key: "drift", label: "Drift", min: 0, max: 1, step: 0.01, default: 0, hint: "Pulls toward the centre" },
      SEED,
    ],
    body: (ctx) => {
      const { width: w, height: h, values: v } = ctx;
      const count = Math.max(1, Math.round(v.count));
      const rand = rng(v.seed);
      const out: string[] = [];
      for (let i = 0; i < count; i++) {
        const rx = rand();
        const ry = rand();
        // Drift lerps each point toward the centre, which turns an even field
        // into a cluster without needing a second distribution.
        const x = (rx + (0.5 - rx) * v.drift) * w;
        const y = (ry + (0.5 - ry) * v.drift) * h;
        const r = v.size * (1 - rand() * v.variance);
        if (r <= 0.2) continue;
        out.push(
          `  <circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${ramp(ctx.palette, i % Math.max(1, ctx.palette.length), Math.max(1, ctx.palette.length))}" />`,
        );
      }
      return out.join("\n");
    },
  },

  {
    id: "low-poly",
    label: "Low poly",
    params: [
      { key: "columns", label: "Columns", min: 2, max: 24, step: 1, default: 8 },
      { key: "rows", label: "Rows", min: 2, max: 24, step: 1, default: 5 },
      { key: "jitter", label: "Jitter", min: 0, max: 1, step: 0.01, default: 0.45 },
      SEED,
    ],
    body: (ctx) => {
      const { width: w, height: h, values: v } = ctx;
      const cols = Math.max(2, Math.round(v.columns));
      const rows = Math.max(2, Math.round(v.rows));
      const rand = rng(v.seed);
      const cw = w / cols;
      const ch = h / rows;

      // Displace an interior lattice, then split each cell into two triangles.
      // Edge vertices stay pinned, without which the mesh pulls away from the
      // canvas and leaves a transparent fringe.
      const grid: [number, number][][] = [];
      for (let r = 0; r <= rows; r++) {
        const row: [number, number][] = [];
        for (let c = 0; c <= cols; c++) {
          const edge = r === 0 || c === 0 || r === rows || c === cols;
          const jx = edge ? 0 : (rand() - 0.5) * cw * v.jitter;
          const jy = edge ? 0 : (rand() - 0.5) * ch * v.jitter;
          row.push([c * cw + jx, r * ch + jy]);
        }
        grid.push(row);
      }

      const out: string[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const a = grid[r][c];
          const b = grid[r][c + 1];
          const d = grid[r + 1][c];
          const e = grid[r + 1][c + 1];
          for (const tri of [
            [a, b, d],
            [b, e, d],
          ]) {
            // Shade by position rather than by index, so the mesh reads as a
            // gradient across the canvas instead of as stripes.
            const shade = Math.round(
              ((c / cols + r / rows) / 2) * (ctx.palette.length - 1),
            );
            const fill = ctx.palette[Math.min(ctx.palette.length - 1, Math.max(0, shade))] ?? "#888888";
            // Stroked in its own fill colour: adjacent triangles share an
            // edge, and antialiasing leaves a hairline of background showing
            // through every one of them. A hairline stroke makes neighbours
            // overlap by half a pixel and the seams disappear. Cheaper and
            // more predictable than shape-rendering, which would also throw
            // away the antialiasing that makes the diagonals look right.
            out.push(
              `  <path d="${closedPath(tri as [number, number][])}" fill="${fill}" stroke="${fill}" stroke-width="1" />`,
            );
          }
        }
      }
      return out.join("\n");
    },
  },

  {
    id: "contours",
    label: "Contours",
    params: [
      { key: "lines", label: "Lines", min: 2, max: 30, step: 1, default: 12 },
      { key: "amplitude", label: "Amplitude", min: 0, max: 0.3, step: 0.005, default: 0.07 },
      { key: "frequency", label: "Frequency", min: 0.4, max: 6, step: 0.1, default: 1.6 },
      { key: "thickness", label: "Thickness", min: 0.5, max: 12, step: 0.5, default: 2 },
      SEED,
    ],
    body: (ctx) => {
      const { width: w, height: h, values: v } = ctx;
      const count = Math.max(2, Math.round(v.lines));
      const rand = rng(v.seed);
      const out: string[] = [];
      // One phase walk shared by every line, drifting slightly per line, so the
      // set reads as one landscape rather than as unrelated squiggles.
      let phase = rand() * Math.PI * 2;
      for (let i = 0; i < count; i++) {
        phase += (rand() - 0.5) * 0.6;
        const y0 = ((i + 0.5) / count) * h;
        const pts: [number, number][] = [];
        const samples = 20;
        for (let s = 0; s <= samples; s++) {
          const x = (s / samples) * w;
          const y =
            y0 + Math.sin((s / samples) * Math.PI * 2 * v.frequency + phase) * h * v.amplitude;
          pts.push([x, y]);
        }
        out.push(
          `  <path d="${smoothOpenPath(pts)}" fill="none" stroke="${ramp(ctx.palette, i, count)}" stroke-width="${n(v.thickness)}" stroke-linecap="round" />`,
        );
      }
      return out.join("\n");
    },
  },

  {
    id: "steps",
    label: "Stacked steps",
    params: [
      { key: "steps", label: "Steps", min: 2, max: 16, step: 1, default: 7 },
      { key: "skew", label: "Skew", min: -1, max: 1, step: 0.01, default: 0.35 },
      { key: "gap", label: "Gap", min: 0, max: 40, step: 1, default: 0 },
      SEED,
    ],
    body: (ctx) => {
      const { width: w, height: h, values: v } = ctx;
      const count = Math.max(2, Math.round(v.steps));
      const out: string[] = [];
      const band = h / count;
      for (let i = 0; i < count; i++) {
        const y = i * band;
        // The skew shifts each band's leading edge, so the stack reads as a
        // staircase rather than as a set of stripes.
        const lead = (i / (count - 1)) * w * v.skew;
        const pts: [number, number][] = [
          [lead, y + v.gap / 2],
          [w + lead, y + v.gap / 2],
          [w + lead, y + band - v.gap / 2],
          [lead, y + band - v.gap / 2],
        ];
        out.push(`  <path d="${closedPath(pts)}" fill="${ramp(ctx.palette, i, count)}" />`);
      }
      return out.join("\n");
    },
  },

  {
    id: "sunbeams",
    label: "Sunbeams",
    params: [
      { key: "rays", label: "Rays", min: 3, max: 60, step: 1, default: 16 },
      { key: "originX", label: "Origin X", min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: "originY", label: "Origin Y", min: 0, max: 1, step: 0.01, default: 0.15 },
      { key: "spread", label: "Spread", min: 0.05, max: 1, step: 0.01, default: 0.5, hint: "Ray width as a fraction of the gap" },
      SEED,
    ],
    body: (ctx) => {
      const { width: w, height: h, values: v } = ctx;
      const rays = Math.max(3, Math.round(v.rays));
      const ox = w * v.originX;
      const oy = h * v.originY;
      // Long enough to leave the canvas from any origin, so a beam never stops
      // short and reveals the wedge it really is.
      const reach = Math.hypot(w, h) * 2;
      const step = 360 / rays;
      const out: string[] = [];
      for (let i = 0; i < rays; i++) {
        const a = i * step;
        const half = step * 0.5 * v.spread;
        const [x1, y1] = polar(ox, oy, reach, a - half);
        const [x2, y2] = polar(ox, oy, reach, a + half);
        out.push(
          `  <path d="M ${n(ox)} ${n(oy)} L ${n(x1)} ${n(y1)} L ${n(x2)} ${n(y2)} Z" fill="${ramp(ctx.palette, i, rays)}" />`,
        );
      }
      return out.join("\n");
    },
  },

  {
    id: "mesh",
    label: "Gradient mesh",
    params: [
      { key: "blobs", label: "Blobs", min: 2, max: 8, step: 1, default: 4 },
      { key: "size", label: "Size", min: 0.2, max: 1.2, step: 0.01, default: 0.6 },
      { key: "blur", label: "Softness", min: 0, max: 0.5, step: 0.01, default: 0.22 },
      SEED,
    ],
    body: (ctx) => {
      const { width: w, height: h, values: v } = ctx;
      const count = Math.max(2, Math.round(v.blobs));
      const rand = rng(v.seed);
      const short = Math.min(w, h);
      const defs: string[] = [];
      const shapes: string[] = [];
      for (let i = 0; i < count; i++) {
        const cx = rand() * w;
        const cy = rand() * h;
        const r = short * v.size * (0.5 + rand() * 0.6);
        const color = ramp(ctx.palette, i, count);
        // A radial stop that fades to fully transparent is what makes these
        // read as light rather than as overlapping discs — the alpha does the
        // blending, so no filter and no rasterization is needed.
        defs.push(
          `  <radialGradient id="mesh${i}" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="${color}" stop-opacity="0.85" />
    <stop offset="1" stop-color="${color}" stop-opacity="0" />
  </radialGradient>`,
        );
        shapes.push(
          `  <circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="url(#mesh${i})" />`,
        );
      }
      const softness = v.blur > 0
        ? `  <filter id="meshBlur" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur stdDeviation="${n(short * v.blur * 0.25)}" />
  </filter>`
        : "";
      return `<defs>\n${defs.join("\n")}\n${softness}\n</defs>\n<g${v.blur > 0 ? ' filter="url(#meshBlur)"' : ""}>\n${shapes.join("\n")}\n</g>`;
    },
  },
];

export function sceneById(id: string): SceneDef | undefined {
  return SCENES.find((s) => s.id === id);
}

export function defaultSceneValues(scene: SceneDef): Record<string, number> {
  return defaultsFor(scene.params);
}

/**
 * Wrap a scene's body into a complete document.
 *
 * The background is a full-bleed rect rather than a CSS property, because the
 * export is a *file*: a backdrop whose background only exists in the panel
 * that made it is not a backdrop.
 */
export function renderScene(scene: SceneDef, ctx: SceneContext): string {
  const { width, height } = ctx;
  const bg = ctx.background
    ? `  <rect width="${n(width)}" height="${n(height)}" fill="${ctx.background}" />\n`
    : "";
  const body = scene.body(ctx);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(width)} ${n(height)}" width="${n(width)}" height="${n(height)}">\n${bg}${body}\n</svg>`;
}

/** A fresh seed, for the Roll control. */
export function rollSeed(): number {
  return 1 + Math.floor(Math.random() * 9999);
}
