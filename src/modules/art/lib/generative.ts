// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Primitives every generator in the pack shares.
 *
 * Extracted when the scene generators arrived, for one reason: the alternative
 * was a second mulberry32. Two PRNGs in one pack is exactly the drift pitfall
 * #18 is about — they start identical, one gets "improved", and suddenly the
 * same seed means two different things depending on which panel you are in.
 * There is one generator of randomness here and everything draws from it.
 */

/** Round for markup: short strings, and no `0.30000000000000004`. */
export function n(value: number, dp = 2): string {
  return String(Number(value.toFixed(dp)));
}

/**
 * mulberry32 — a small, fast, well-distributed PRNG.
 *
 * Chosen over `Math.random()` because it is *seedable*, and over a hand-rolled
 * LCG because those have visible structure at low bit depths, which in a blob
 * shows up as lumps that all lean the same way.
 *
 * Seeding is not a nicety here. A generator that rolls fresh randomness per
 * render disagrees with its own export, jumps on every re-render, and rerolls
 * the whole form when one slider moves, so you can never converge on the one
 * you liked. Seed is a parameter like any other: same numbers in, same art out.
 */
export function rng(seed: number): () => number {
  let a = Math.floor(seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A point on a circle, with angles measured from twelve o'clock.
 *
 * SVG's own zero is three o'clock, which is fine for maths and wrong for a
 * control: nobody dialling "Rotation" on a star expects zero to mean "one
 * point aimed right". The quarter-turn is applied once, here, so every radial
 * generator is consistent instead of each rediscovering it.
 */
export function polar(
  cx: number,
  cy: number,
  radius: number,
  degrees: number,
): [number, number] {
  const rad = ((degrees - 90) * Math.PI) / 180;
  return [cx + Math.cos(rad) * radius, cy + Math.sin(rad) * radius];
}

/** A closed polygon through a list of points. */
export function closedPath(pts: readonly [number, number][]): string {
  if (pts.length === 0) return "";
  return `M ${pts.map(([x, y]) => `${n(x)} ${n(y)}`).join(" L ")} Z`;
}

/**
 * A point stepped back from `from` toward `to` by `distance`, clamped to the
 * midpoint. The clamp is what stops a large corner radius on a triangle from
 * overshooting its edge and turning the shape inside out.
 */
export function trim(
  from: readonly [number, number],
  to: readonly [number, number],
  distance: number,
): [number, number] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return [from[0], from[1]];
  const t = Math.min(distance, len / 2) / len;
  return [from[0] + dx * t, from[1] + dy * t];
}

/**
 * A smooth closed curve through the given points.
 *
 * Catmull-Rom converted to cubic beziers, because Catmull-Rom passes *through*
 * its control points — so a jittered radius is actually honoured rather than
 * merely suggested — and the conversion leaves a plain `C` path that any
 * renderer understands.
 */
export function smoothClosedPath(pts: readonly [number, number][]): string {
  if (pts.length < 3) return closedPath(pts);
  // Wrap-around indexing: the curve is closed, so the neighbours of the first
  // and last points are each other.
  const at = (i: number) => pts[(i + pts.length) % pts.length];

  let d = `M ${n(at(0)[0])} ${n(at(0)[1])}`;
  for (let i = 0; i < pts.length; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${n(c1x)} ${n(c1y)}, ${n(c2x)} ${n(c2y)}, ${n(p2[0])} ${n(p2[1])}`;
  }
  return `${d} Z`;
}

/**
 * A smooth *open* curve through the given points.
 *
 * The open form cannot wrap, so the endpoints duplicate their neighbours —
 * which is what keeps the first and last segments from flying off, the usual
 * artefact when a closed-curve routine is reused for an open one.
 */
export function smoothOpenPath(pts: readonly [number, number][]): string {
  if (pts.length < 2) return "";
  const at = (i: number) => pts[Math.min(pts.length - 1, Math.max(0, i))];

  let d = `M ${n(pts[0][0])} ${n(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${n(c1x)} ${n(c1y)}, ${n(c2x)} ${n(c2y)}, ${n(p2[0])} ${n(p2[1])}`;
  }
  return d;
}

/** A shared parameter description, used by both shapes and scenes. */
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

/** The default parameter set for a generator, ready to seed a control panel. */
export function defaultsFor(params: readonly ParamSpec[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of params) out[p.key] = p.default;
  return out;
}
