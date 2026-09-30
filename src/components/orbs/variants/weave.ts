// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Original Nexis shader. The idea is from shadcn labs' orb list ("Weave": a lattice knitted into the skin of the ball);
// the code is written from scratch, not derived from their non-commercial
// shaders.
import type { OrbVariant } from "../types";
import { COMMON } from "./glsl";

export const weave: OrbVariant = {
  key: "weave",
  label: "Weave",
  note: "Threads woven over and under across the sphere.",
  themed: true,
  params: [
    { key: "roll", label: "Roll", min: 0, max: 3, default: 0.3, integrate: true },
    { key: "density", label: "Density", min: 3, max: 14, default: 6 },
    { key: "relief", label: "Relief", min: 0, max: 1, default: 0.6 },
  ],
  colors: [
    { key: "warp", label: "Warp", default: "theme:--brand|#f0765a" },
    { key: "weft", label: "Weft", default: "theme:--terminal-ansi-cyan|#4fd1c5" },
  ],
  statePresets: {
    idle: { roll: 0.3, density: 6, relief: 0.6 },
    thinking: { roll: 0.9, density: 7.5, relief: 0.7 },
    speaking: { roll: 1.6, density: 5.5, relief: 0.9 },
  },
  fragment: /* glsl */ `
uniform float p_roll;
uniform float p_density;
uniform float p_relief;
uniform vec3 c_warp;
uniform vec3 c_weft;
${COMMON}
void main() {
  vec2 uv = orbUv();
  float radius = 0.84;
  float d = length(uv);
  vec3 s = spherePoint(uv / radius);
  vec3 q = turn(s, p_roll, 0.3);
  vec2 g = q.xy / (1.0 + q.z * 0.35) * p_density;
  vec2 cell = floor(g);
  vec2 f = fract(g) - 0.5;
  // Over-under: which thread is on top alternates like a checkerboard.
  float warpOnTop = mod(cell.x + cell.y, 2.0);
  float warp = smoothstep(0.42, 0.28, abs(f.x));
  float weft = smoothstep(0.42, 0.28, abs(f.y));
  float warpH = warp * (0.6 + 0.4 * warpOnTop);
  float weftH = weft * (0.6 + 0.4 * (1.0 - warpOnTop));
  vec3 col = warpH >= weftH ? c_warp : c_weft;
  float h = max(warpH, weftH);
  col *= mix(1.0, 0.45 + 0.55 * h, p_relief);
  col *= 0.35 + 0.65 * lambert(s);
  float inside = discMask(d, radius);
  float alpha = inside * clamp(max(warp, weft) + 0.15, 0.0, 1.0);
  fragColor = vec4(col * alpha, alpha);
}
`,
};
