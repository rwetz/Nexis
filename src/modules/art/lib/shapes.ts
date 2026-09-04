// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Parametric shape generators for the Art pack.
 *
 * Each generator is a **pure function from numbers to an SVG document**, which
 * is the property everything else here depends on: the output drops straight
 * into the playground's editor, where the existing optimize, preview and
 * export paths already work on it. No generator owns a preview or an export of
 * its own.
 *
 * ## Randomness is seeded, always
 *
 * A blob is "random" in shape, and the naive implementation calls `Math.random()`
 * at render time. That is wrong here in a way that is not obvious until you use
 * it: the preview would differ from the exported markup, the shape would jump
 * on every re-render, and nudging one slider would reroll the whole form so you
 * could never converge on the one you liked. Seed is a parameter like any
 * other — same numbers in, same path out, forever.
 */

import {
  closedPath,
  defaultsFor,
  n,
  polar,
  rng,
  smoothClosedPath,
  trim,
  type ParamSpec,
} from "./generative";

export type { ParamSpec };

export type ShapeDef = {
  id: string;
  label: string;
  params: readonly ParamSpec[];
  render: (values: Record<string, number>) => string;
};

function svgDoc(size: number, body: string, extra = ""): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(size)} ${n(size)}" width="${n(size)}" height="${n(size)}"${extra}>\n${body}\n</svg>`;
}

// ── Blob ────────────────────────────────────────────────────────────────────

/**
 * Closed organic curve through points on a jittered circle.
 *
 * The points are joined with a Catmull-Rom spline converted to cubic beziers
 * rather than with straight lines or quadratics: Catmull-Rom passes *through*
 * its control points, so each jittered radius is actually honoured, and the
 * conversion keeps the result a plain `C` path that any renderer understands.
 */
function blobPath(
  cx: number,
  cy: number,
  radius: number,
  points: number,
  variance: number,
  seed: number,
): string {
  const rand = rng(seed);
  const pts: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const r = radius * (1 + (rand() - 0.5) * 2 * variance);
    pts.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
  }
  return smoothClosedPath(pts);
}

// ── Wave ────────────────────────────────────────────────────────────────────

function wavePath(
  width: number,
  midY: number,
  amplitude: number,
  frequency: number,
  phase: number,
  samples = 64,
): string {
  let d = "";
  for (let i = 0; i <= samples; i++) {
    const x = (i / samples) * width;
    const y =
      midY + Math.sin((i / samples) * Math.PI * 2 * frequency + phase) * amplitude;
    d += `${i === 0 ? "M" : " L"} ${n(x)} ${n(y)}`;
  }
  return d;
}

// ── Radial helpers ──────────────────────────────────────────────────────────

// ── The registry ──────────────────────────────────────────────────────────

const SIZE = 240;

export const SHAPES: readonly ShapeDef[] = [
  {
    id: "blob",
    label: "Blob",
    params: [
      { key: "points", label: "Points", min: 3, max: 16, step: 1, default: 7, hint: "More points, more detail" },
      { key: "variance", label: "Variance", min: 0, max: 0.6, step: 0.01, default: 0.22, hint: "0 is a circle" },
      { key: "radius", label: "Radius", min: 20, max: 110, step: 1, default: 84 },
      { key: "seed", label: "Seed", min: 1, max: 9999, step: 1, default: 42, hint: "Same seed, same blob" },
    ],
    render: (v) =>
      svgDoc(
        SIZE,
        `  <path d="${blobPath(SIZE / 2, SIZE / 2, v.radius, Math.round(v.points), v.variance, v.seed)}" fill="currentColor" />`,
      ),
  },
  {
    id: "wave",
    label: "Wave",
    params: [
      { key: "amplitude", label: "Amplitude", min: 0, max: 80, step: 1, default: 28 },
      { key: "frequency", label: "Frequency", min: 0.5, max: 8, step: 0.1, default: 2 },
      { key: "phase", label: "Phase", min: 0, max: 6.28, step: 0.01, default: 0 },
      { key: "thickness", label: "Thickness", min: 0.5, max: 16, step: 0.5, default: 3 },
    ],
    render: (v) =>
      svgDoc(
        SIZE,
        `  <path d="${wavePath(SIZE, SIZE / 2, v.amplitude, v.frequency, v.phase)}" fill="none" stroke="currentColor" stroke-width="${n(v.thickness)}" stroke-linecap="round" />`,
      ),
  },
  {
    id: "wave-fill",
    label: "Wave fill",
    params: [
      { key: "amplitude", label: "Amplitude", min: 0, max: 80, step: 1, default: 24 },
      { key: "frequency", label: "Frequency", min: 0.5, max: 8, step: 0.1, default: 1.5 },
      { key: "phase", label: "Phase", min: 0, max: 6.28, step: 0.01, default: 0 },
      { key: "level", label: "Level", min: 20, max: 220, step: 1, default: 120, hint: "Where the surface sits" },
    ],
    render: (v) =>
      svgDoc(
        SIZE,
        `  <path d="${wavePath(SIZE, v.level, v.amplitude, v.frequency, v.phase)} L ${n(SIZE)} ${n(SIZE)} L 0 ${n(SIZE)} Z" fill="currentColor" />`,
      ),
  },
  {
    id: "arc",
    label: "Arc",
    params: [
      { key: "radius", label: "Radius", min: 20, max: 110, step: 1, default: 90 },
      { key: "start", label: "Start", min: 0, max: 360, step: 1, default: 200 },
      { key: "sweep", label: "Sweep", min: 1, max: 359, step: 1, default: 140 },
      { key: "thickness", label: "Thickness", min: 0.5, max: 40, step: 0.5, default: 6 },
    ],
    render: (v) => {
      const c = SIZE / 2;
      const a0 = (v.start * Math.PI) / 180;
      const a1 = ((v.start + v.sweep) * Math.PI) / 180;
      const x0 = c + Math.cos(a0) * v.radius;
      const y0 = c + Math.sin(a0) * v.radius;
      const x1 = c + Math.cos(a1) * v.radius;
      const y1 = c + Math.sin(a1) * v.radius;
      // The large-arc flag is a real trap: without it every sweep over 180
      // degrees silently draws the short way round instead.
      const large = v.sweep > 180 ? 1 : 0;
      return svgDoc(
        SIZE,
        `  <path d="M ${n(x0)} ${n(y0)} A ${n(v.radius)} ${n(v.radius)} 0 ${large} 1 ${n(x1)} ${n(y1)}" fill="none" stroke="currentColor" stroke-width="${n(v.thickness)}" stroke-linecap="round" />`,
      );
    },
  },
  {
    id: "divider",
    label: "Divider",
    params: [
      { key: "segments", label: "Segments", min: 2, max: 40, step: 1, default: 12 },
      { key: "amplitude", label: "Amplitude", min: 0, max: 30, step: 1, default: 8 },
      { key: "thickness", label: "Thickness", min: 0.5, max: 10, step: 0.5, default: 2 },
      { key: "round", label: "Roundness", min: 0, max: 1, step: 1, default: 1, hint: "0 zigzag, 1 curved" },
    ],
    render: (v) => {
      const segs = Math.max(2, Math.round(v.segments));
      const mid = SIZE / 2;
      const step = SIZE / segs;
      let d = `M 0 ${n(mid)}`;
      for (let i = 0; i < segs; i++) {
        const x = (i + 1) * step;
        const y = mid + (i % 2 === 0 ? -v.amplitude : v.amplitude);
        d +=
          v.round >= 0.5
            ? ` Q ${n(x - step / 2)} ${n(y)}, ${n(x)} ${n(mid)}`
            : ` L ${n(x - step / 2)} ${n(y)} L ${n(x)} ${n(mid)}`;
      }
      return svgDoc(
        SIZE,
        `  <path d="${d}" fill="none" stroke="currentColor" stroke-width="${n(v.thickness)}" stroke-linecap="round" stroke-linejoin="round" />`,
      );
    },
  },
  {
    id: "grain",
    label: "Grain",
    params: [
      { key: "frequency", label: "Frequency", min: 0.1, max: 2, step: 0.01, default: 0.8, hint: "Higher is finer" },
      { key: "octaves", label: "Octaves", min: 1, max: 6, step: 1, default: 3 },
      { key: "opacity", label: "Opacity", min: 0.02, max: 1, step: 0.01, default: 0.35 },
      { key: "seed", label: "Seed", min: 1, max: 9999, step: 1, default: 7 },
    ],
    // feTurbulence rather than thousands of dots: it is a handful of bytes,
    // resolution-independent, and the seed is part of the filter, so the
    // markup stays deterministic like every other generator here.
    //
    // The turbulence is converted to an *alpha mask* and composited against a
    // `currentColor` rect, rather than being painted directly. Raw
    // feTurbulence output is opaque RGB static: it ignores fill entirely, so
    // it would be the one generator here that cannot take the theme colour.
    // The colour matrix moves the red channel into alpha and zeroes RGB, and
    // the composite keeps the rect only where the noise is opaque.
    render: (v) =>
      svgDoc(
        SIZE,
        `  <filter id="grain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="${n(v.frequency, 3)}" numOctaves="${n(Math.round(v.octaves))}" seed="${n(Math.round(v.seed))}" result="noise" />
    <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="mask" />
    <feComposite in="SourceGraphic" in2="mask" operator="in" />
  </filter>
  <rect width="${n(SIZE)}" height="${n(SIZE)}" fill="currentColor" filter="url(#grain)" opacity="${n(v.opacity)}" />`,
      ),
  },
  {
    id: "star",
    label: "Star",
    params: [
      { key: "points", label: "Points", min: 3, max: 20, step: 1, default: 5 },
      { key: "outer", label: "Outer radius", min: 20, max: 115, step: 1, default: 100 },
      { key: "inner", label: "Inner radius", min: 4, max: 115, step: 1, default: 42, hint: "Near the outer radius is a cog; far is a spike" },
      { key: "rotation", label: "Rotation", min: 0, max: 360, step: 1, default: 0 },
    ],
    render: (v) => {
      const c = SIZE / 2;
      const count = Math.max(3, Math.round(v.points));
      const pts: [number, number][] = [];
      for (let i = 0; i < count * 2; i++) {
        const r = i % 2 === 0 ? v.outer : v.inner;
        pts.push(polar(c, c, r, v.rotation + (i * 180) / count));
      }
      return svgDoc(SIZE, `  <path d="${closedPath(pts)}" fill="currentColor" />`);
    },
  },
  {
    id: "polygon",
    label: "Polygon",
    params: [
      { key: "sides", label: "Sides", min: 3, max: 24, step: 1, default: 6 },
      { key: "radius", label: "Radius", min: 20, max: 115, step: 1, default: 100 },
      { key: "rotation", label: "Rotation", min: 0, max: 360, step: 1, default: 0 },
      { key: "round", label: "Corner radius", min: 0, max: 40, step: 1, default: 0, hint: "0 is a hard corner" },
    ],
    render: (v) => {
      const c = SIZE / 2;
      const sides = Math.max(3, Math.round(v.sides));
      const pts: [number, number][] = [];
      for (let i = 0; i < sides; i++) {
        pts.push(polar(c, c, v.radius, v.rotation + (i * 360) / sides));
      }
      if (v.round <= 0) {
        return svgDoc(SIZE, `  <path d="${closedPath(pts)}" fill="currentColor" />`);
      }
      // Rounded corners are cut back along both incident edges and rejoined by
      // a quadratic through the original vertex. `trim` clamps the cut to half
      // the edge, without which a large radius on a triangle turns the shape
      // inside out.
      let d = "";
      for (let i = 0; i < sides; i++) {
        const prev = pts[(i - 1 + sides) % sides];
        const cur = pts[i];
        const next = pts[(i + 1) % sides];
        const back = trim(cur, prev, v.round);
        const fwd = trim(cur, next, v.round);
        d += i === 0 ? `M ${n(back[0])} ${n(back[1])}` : ` L ${n(back[0])} ${n(back[1])}`;
        d += ` Q ${n(cur[0])} ${n(cur[1])}, ${n(fwd[0])} ${n(fwd[1])}`;
      }
      return svgDoc(SIZE, `  <path d="${d} Z" fill="currentColor" />`);
    },
  },
  {
    id: "gear",
    label: "Gear",
    params: [
      { key: "teeth", label: "Teeth", min: 4, max: 32, step: 1, default: 10 },
      { key: "radius", label: "Radius", min: 30, max: 115, step: 1, default: 100 },
      { key: "depth", label: "Tooth depth", min: 2, max: 50, step: 1, default: 18 },
      { key: "bore", label: "Bore", min: 0, max: 80, step: 1, default: 34, hint: "0 removes the hole" },
    ],
    render: (v) => {
      const c = SIZE / 2;
      const teeth = Math.max(4, Math.round(v.teeth));
      const outer = v.radius;
      const inner = Math.max(4, v.radius - v.depth);
      const pts: [number, number][] = [];
      // Four points per tooth — rise, crest, fall, valley — so the profile is
      // square-shouldered rather than a wobbly star.
      for (let i = 0; i < teeth * 4; i++) {
        const r = i % 4 === 1 || i % 4 === 2 ? outer : inner;
        pts.push(polar(c, c, r, (i * 360) / (teeth * 4)));
      }
      // The bore is punched with `fill-rule="evenodd"` rather than painted over
      // in a background colour: the gear stays one path, and it works on any
      // background rather than only on the one it was drawn against.
      const body =
        v.bore > 0
          ? `  <path fill-rule="evenodd" d="${closedPath(pts)} M ${n(c + v.bore)} ${n(c)} A ${n(v.bore)} ${n(v.bore)} 0 1 0 ${n(c - v.bore)} ${n(c)} A ${n(v.bore)} ${n(v.bore)} 0 1 0 ${n(c + v.bore)} ${n(c)} Z" fill="currentColor" />`
          : `  <path d="${closedPath(pts)}" fill="currentColor" />`;
      return svgDoc(SIZE, body);
    },
  },
  {
    id: "spiral",
    label: "Spiral",
    params: [
      { key: "turns", label: "Turns", min: 0.5, max: 8, step: 0.1, default: 3 },
      { key: "radius", label: "Radius", min: 20, max: 115, step: 1, default: 100 },
      { key: "start", label: "Inner radius", min: 0, max: 60, step: 1, default: 6 },
      { key: "thickness", label: "Thickness", min: 0.5, max: 16, step: 0.5, default: 3 },
    ],
    render: (v) => {
      const c = SIZE / 2;
      const steps = Math.max(24, Math.round(v.turns * 48));
      let d = "";
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const [x, y] = polar(c, c, v.start + (v.radius - v.start) * t, t * v.turns * 360);
        d += `${i === 0 ? "M" : " L"} ${n(x)} ${n(y)}`;
      }
      return svgDoc(
        SIZE,
        `  <path d="${d}" fill="none" stroke="currentColor" stroke-width="${n(v.thickness)}" stroke-linecap="round" />`,
      );
    },
  },
  {
    id: "rings",
    label: "Rings",
    params: [
      { key: "count", label: "Rings", min: 1, max: 12, step: 1, default: 4 },
      { key: "radius", label: "Outer radius", min: 20, max: 115, step: 1, default: 105 },
      { key: "gap", label: "Gap", min: 4, max: 60, step: 1, default: 22 },
      { key: "thickness", label: "Thickness", min: 0.5, max: 20, step: 0.5, default: 4 },
    ],
    render: (v) => {
      const c = SIZE / 2;
      const count = Math.max(1, Math.round(v.count));
      const body: string[] = [];
      for (let i = 0; i < count; i++) {
        const r = v.radius - i * v.gap;
        if (r <= 0) break;
        body.push(
          `  <circle cx="${n(c)}" cy="${n(c)}" r="${n(r)}" fill="none" stroke="currentColor" stroke-width="${n(v.thickness)}" />`,
        );
      }
      return svgDoc(SIZE, body.join("\n"));
    },
  },
  {
    id: "dots",
    label: "Dot grid",
    params: [
      { key: "columns", label: "Columns", min: 2, max: 24, step: 1, default: 8 },
      { key: "rows", label: "Rows", min: 2, max: 24, step: 1, default: 8 },
      { key: "size", label: "Dot size", min: 0.5, max: 16, step: 0.5, default: 4 },
      { key: "falloff", label: "Falloff", min: 0, max: 1, step: 0.01, default: 0, hint: "Shrinks dots toward the edges" },
    ],
    render: (v) => {
      const cols = Math.max(2, Math.round(v.columns));
      const rows = Math.max(2, Math.round(v.rows));
      const c = SIZE / 2;
      const maxDist = Math.hypot(c, c);
      const body: string[] = [];
      for (let r = 0; r < rows; r++) {
        for (let col = 0; col < cols; col++) {
          const x = ((col + 0.5) / cols) * SIZE;
          const y = ((r + 0.5) / rows) * SIZE;
          const dist = Math.hypot(x - c, y - c) / maxDist;
          const radius = v.size * (1 - v.falloff * dist);
          if (radius <= 0.05) continue;
          body.push(
            `  <circle cx="${n(x)}" cy="${n(y)}" r="${n(radius)}" fill="currentColor" />`,
          );
        }
      }
      return svgDoc(SIZE, body.join("\n"));
    },
  },
  {
    id: "burst",
    label: "Burst",
    params: [
      { key: "rays", label: "Rays", min: 3, max: 48, step: 1, default: 12 },
      { key: "outer", label: "Outer radius", min: 20, max: 115, step: 1, default: 105 },
      { key: "inner", label: "Inner radius", min: 0, max: 100, step: 1, default: 40 },
      { key: "thickness", label: "Thickness", min: 0.5, max: 20, step: 0.5, default: 5 },
    ],
    render: (v) => {
      const c = SIZE / 2;
      const rays = Math.max(3, Math.round(v.rays));
      const body: string[] = [];
      for (let i = 0; i < rays; i++) {
        const angle = (i * 360) / rays;
        const [x1, y1] = polar(c, c, v.inner, angle);
        const [x2, y2] = polar(c, c, v.outer, angle);
        body.push(
          `  <line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="currentColor" stroke-width="${n(v.thickness)}" stroke-linecap="round" />`,
        );
      }
      return svgDoc(SIZE, body.join("\n"));
    },
  },
  {
    id: "chevron",
    label: "Chevrons",
    params: [
      { key: "count", label: "Count", min: 1, max: 12, step: 1, default: 3 },
      { key: "spread", label: "Spread", min: 10, max: 90, step: 1, default: 40 },
      { key: "angle", label: "Angle", min: 10, max: 80, step: 1, default: 45, hint: "Steepness of each arrow" },
      { key: "thickness", label: "Thickness", min: 0.5, max: 20, step: 0.5, default: 6 },
    ],
    render: (v) => {
      const c = SIZE / 2;
      const count = Math.max(1, Math.round(v.count));
      const reach = 70;
      const rise = reach * Math.tan((v.angle * Math.PI) / 180);
      const body: string[] = [];
      // Centred as a set rather than each on the middle line, so raising the
      // count grows the stack symmetrically instead of pushing it downward.
      const top = c - ((count - 1) * v.spread) / 2;
      for (let i = 0; i < count; i++) {
        const y = top + i * v.spread;
        body.push(
          `  <path d="M ${n(c - reach)} ${n(y - rise / 2)} L ${n(c)} ${n(y + rise / 2)} L ${n(c + reach)} ${n(y - rise / 2)}" fill="none" stroke="currentColor" stroke-width="${n(v.thickness)}" stroke-linecap="round" stroke-linejoin="round" />`,
        );
      }
      return svgDoc(SIZE, body.join("\n"));
    },
  },
];

export function shapeById(id: string): ShapeDef | undefined {
  return SHAPES.find((s) => s.id === id);
}

/** The default parameter set for a shape, ready to seed a control panel. */
export function defaultValues(shape: ShapeDef): Record<string, number> {
  return defaultsFor(shape.params);
}
