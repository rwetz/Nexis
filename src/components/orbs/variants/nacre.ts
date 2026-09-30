// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Original Nexis shader. The idea is from shadcn labs' orb list ("Nacre": mother-of-pearl contour bands);
// the code is written from scratch, not derived from their non-commercial
// shaders.
import type { OrbVariant } from "../types";
import { COMMON } from "./glsl";

export const nacre: OrbVariant = {
  key: "nacre",
  label: "Nacre",
  note: "Mother-of-pearl: pale contour bands, each layer its own soft hue.",
  themed: false,
  params: [
    { key: "flow", label: "Flow", min: 0, max: 3, default: 0.3, integrate: true },
    { key: "bands", label: "Layers", min: 3, max: 16, default: 8 },
    { key: "pearl", label: "Pearl", min: 0, max: 1, default: 0.6 },
  ],
  colors: [
    { key: "base", label: "Pearl", default: "#f3efe9" },
  ],
  statePresets: {
    idle: { flow: 0.3, bands: 8, pearl: 0.6 },
    thinking: { flow: 0.9, bands: 11, pearl: 0.5 },
    speaking: { flow: 1.5, bands: 9, pearl: 0.35 },
  },
  fragment: /* glsl */ `
uniform float p_flow;
uniform float p_bands;
uniform float p_pearl;
uniform vec3 c_base;
${COMMON}
void main() {
  vec2 uv = orbUv();
  float radius = 0.84;
  float d = length(uv);
  vec3 s = spherePoint(uv / radius);
  float field = fbm(s.xy * 1.6 + s.z * 0.8 + vec2(p_flow * 0.3, -p_flow * 0.2));
  float layer = floor(field * p_bands);
  float within = fract(field * p_bands);
  // Each layer gets its own hue; pearl washes them toward white.
  vec3 col = mix(spectrum(layer * 0.137 + 0.1), c_base, p_pearl);
  float rim = smoothstep(0.0, 0.08, within) * smoothstep(1.0, 0.92, within);
  col *= (0.8 + 0.2 * rim) * (0.7 + 0.3 * lambert(s));
  col += vec3(pow(lambert(s), 24.0)) * 0.5;
  float inside = discMask(d, radius);
  fragColor = vec4(col * inside, inside);
}
`,
};
