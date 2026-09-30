// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Original Nexis shader. The idea is from shadcn labs' orb list ("Chromatic");
// the code is written from scratch, not derived from their non-commercial
// shaders.
import type { OrbVariant } from "../types";
import { COMMON } from "./glsl";

export const chromatic: OrbVariant = {
  key: "chromatic",
  label: "Chromatic",
  note: "Refracted bands that split into red, green and blue at the edges.",
  themed: false,
  params: [
    { key: "flow", label: "Flow", min: 0, max: 3, default: 0.4, integrate: true },
    { key: "split", label: "Split", min: 0, max: 0.3, default: 0.08 },
    { key: "bands", label: "Bands", min: 2, max: 14, default: 6 },
  ],
  colors: [
    { key: "tint", label: "Tint", default: "#ffffff" },
  ],
  statePresets: {
    idle: { flow: 0.4, split: 0.08, bands: 6 },
    thinking: { flow: 1.1, split: 0.14, bands: 8 },
    speaking: { flow: 1.8, split: 0.22, bands: 7 },
  },
  fragment: /* glsl */ `
uniform float p_flow;
uniform float p_split;
uniform float p_bands;
uniform vec3 c_tint;
${COMMON}
float chromaBands(vec2 p) {
  float w = fbm(p * 1.6 + vec2(p_flow * 0.4, 0.0));
  return 0.5 + 0.5 * sin((p.x + p.y * 0.4 + w) * p_bands);
}

void main() {
  vec2 uv = orbUv();
  float radius = 0.84;
  float d = length(uv);
  vec3 s = spherePoint(uv / radius);
  // Each channel bends a different amount, most at the rim where the glass is
  // steepest: that is dispersion.
  vec2 bend = s.xy * (1.0 - s.z) * p_split * 4.0;
  vec3 col = vec3(chromaBands(s.xy + bend), chromaBands(s.xy + bend * 1.6), chromaBands(s.xy + bend * 2.2)) * c_tint;
  col *= 0.45 + 0.55 * lambert(s);
  col += pow(1.0 - s.z, 3.0) * 0.6;
  float inside = discMask(d, radius);
  fragColor = vec4(col * inside, inside);
}
`,
};
