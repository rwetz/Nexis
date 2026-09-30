// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Original Nexis shader. The idea is from shadcn labs' orb list ("Voxel");
// the code is written from scratch, not derived from their non-commercial
// shaders.
import type { OrbVariant } from "../types";
import { COMMON } from "./glsl";

export const voxel: OrbVariant = {
  key: "voxel",
  label: "Voxel",
  note: "The ball built from bevelled blocks, rippling as it works.",
  themed: true,
  params: [
    { key: "spin", label: "Spin", min: 0, max: 3, default: 0.3, integrate: true },
    { key: "res", label: "Blocks", min: 6, max: 20, default: 11 },
    { key: "ripple", label: "Ripple", min: 0, max: 1, default: 0.3 },
  ],
  colors: [
    { key: "top", label: "Lit", default: "theme:--brand|#f0765a" },
    { key: "side", label: "Shade", default: "theme:--terminal-ansi-blue|#5b8def" },
  ],
  statePresets: {
    idle: { spin: 0.3, res: 11, ripple: 0.3 },
    thinking: { spin: 0.9, res: 13, ripple: 0.6 },
    speaking: { spin: 1.6, res: 10, ripple: 0.95 },
  },
  fragment: /* glsl */ `
uniform float p_spin;
uniform float p_res;
uniform float p_ripple;
uniform vec3 c_top;
uniform vec3 c_side;
${COMMON}
void main() {
  vec2 uv = orbUv();
  float radius = 0.84;
  vec2 g = uv / radius * p_res * 0.5;
  vec2 cell = floor(g) + 0.5;
  vec2 center = cell / (p_res * 0.5);
  // Whole blocks only: a block is in or out by where its centre falls.
  float inside = step(length(center), 1.0);
  vec3 s = spherePoint(center);
  float lift = (vnoise(cell * 0.7 + p_spin * 1.5) - 0.5) * p_ripple;
  vec3 n = normalize(vec3(center * (1.0 + lift), s.z + 0.2));
  vec2 f = fract(g);
  float bevel = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  float edge = smoothstep(0.0, 0.12, bevel);
  vec3 col = mix(c_side * 0.5, c_top, lambert(n)) * (0.6 + 0.4 * edge);
  fragColor = vec4(col * inside, inside);
}
`,
};
