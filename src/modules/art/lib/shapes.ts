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

export type ParamSpec = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  /** One line on what moving it does, for the control's title. */
  hint?: string;
};

export type ShapeDef = {
  id: string;
  label: string;
  params: readonly ParamSpec[];
  render: (values: Record<string, number>) => string;
};

/** Round for markup: short strings, and no `0.30000000000000004`. */
function n(value: number, dp = 2): string {
  return String(Number(value.toFixed(dp)));
}

/**
 * mulberry32 — a small, fast, well-distributed PRNG.
 *
 * Chosen over `Math.random()` because it is *seedable*, and over a hand-rolled
 * LCG because those have visible structure at low bit depths, which in a blob
 * shows up as lumps that all lean the same way.
 */
function rng(seed: number): () => number {
  let a = Math.floor(seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

  // Wrap-around indexing: the curve is closed, so the neighbours of the first
  // and last points are each other.
  const at = (i: number) => pts[(i + pts.length) % pts.length];

  let d = `M ${n(at(0)[0])} ${n(at(0)[1])}`;
  for (let i = 0; i < pts.length; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    // Catmull-Rom (tension 0) to cubic bezier control points.
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${n(c1x)} ${n(c1y)}, ${n(c2x)} ${n(c2y)}, ${n(p2[0])} ${n(p2[1])}`;
  }
  return `${d} Z`;
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

// ── The registry ────────────────────────────────────────────────────────────

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
];

export function shapeById(id: string): ShapeDef | undefined {
  return SHAPES.find((s) => s.id === id);
}

/** The default parameter set for a shape, ready to seed a control panel. */
export function defaultValues(shape: ShapeDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of shape.params) out[p.key] = p.default;
  return out;
}
