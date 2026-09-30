// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Original Nexis shader. The idea is from shadcn labs' orb list ("Phosphor": an ASCII glyph matrix in CRT green);
// the code is written from scratch, not derived from their non-commercial
// shaders.
import type { OrbVariant } from "../types";
import { COMMON } from "./glsl";

export const phosphor: OrbVariant = {
  key: "phosphor",
  label: "Phosphor",
  note: "A matrix of flickering glyphs in phosphor green, wrapped on the ball.",
  themed: false,
  params: [
    { key: "roll", label: "Roll", min: 0, max: 3, default: 0.3, integrate: true },
    { key: "cells", label: "Cells", min: 5, max: 18, default: 8 },
    { key: "churn", label: "Churn", min: 0, max: 6, default: 1.5 },
  ],
  colors: [
    { key: "glow", label: "Phosphor", default: "#39ff88" },
  ],
  statePresets: {
    idle: { roll: 0.3, cells: 8, churn: 1.5 },
    thinking: { roll: 0.9, cells: 9, churn: 4.0 },
    speaking: { roll: 1.6, cells: 8, churn: 5.5 },
  },
  fragment: /* glsl */ `
uniform float p_roll;
uniform float p_cells;
uniform float p_churn;
uniform vec3 c_glow;
${COMMON}
// A 5x5 glyph: bits from a hash, mirrored left to right so it reads as a
// character rather than as noise.
float glyph(vec2 cell, vec2 f, float gen) {
  vec2 px = floor(f * 5.0);
  if (px.x > 2.0) px.x = 4.0 - px.x;
  float on = step(0.55, hash21(cell * 7.3 + px * 1.91 + gen * 13.1));
  float margin = step(0.08, f.x) * step(f.x, 0.92) * step(0.08, f.y) * step(f.y, 0.92);
  return on * margin;
}

void main() {
  vec2 uv = orbUv();
  float radius = 0.84;
  float d = length(uv);
  vec3 s = spherePoint(uv / radius);
  vec3 q = turn(s, p_roll, 0.2);
  vec2 g = q.xy / (0.55 + q.z * 0.45) * p_cells * 0.5;
  vec2 cell = floor(g);
  // Each cell swaps its glyph at its own moment.
  float gen = floor(u_time * p_churn + hash21(cell) * 10.0);
  float lit = glyph(cell, fract(g), gen);
  float scan = 0.8 + 0.2 * sin(gl_FragCoord.y * 1.6);
  vec3 col = c_glow * (lit * 0.95 + 0.07) * (0.3 + 0.7 * lambert(s)) * scan;
  col += c_glow * pow(1.0 - s.z, 3.0) * 0.25;
  float inside = discMask(d, radius);
  fragColor = vec4(col * inside, inside);
}
`,
};
