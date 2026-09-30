// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Original Nexis shader. The idea is from shadcn labs' orb list ("Caustic");
// the code is written from scratch, not derived from their non-commercial
// shaders.
import type { OrbVariant } from "../types";
import { COMMON } from "./glsl";

export const caustic: OrbVariant = {
  key: "caustic",
  label: "Caustic",
  note: "Sunlight caustics rippling across the bottom of a pool.",
  themed: false,
  params: [
    { key: "flow", label: "Flow", min: 0, max: 4, default: 0.6, integrate: true },
    { key: "scale", label: "Scale", min: 1, max: 8, default: 4 },
    { key: "bright", label: "Brightness", min: 0.3, max: 2, default: 1.0 },
  ],
  colors: [
    { key: "water", label: "Water", default: "#47d6d0" },
    { key: "deep", label: "Deep", default: "#1f6fb2" },
  ],
  statePresets: {
    idle: { flow: 0.6, scale: 4, bright: 1.0 },
    thinking: { flow: 1.6, scale: 5, bright: 1.2 },
    speaking: { flow: 2.8, scale: 4.5, bright: 1.6 },
  },
  fragment: /* glsl */ `
uniform float p_flow;
uniform float p_scale;
uniform float p_bright;
uniform vec3 c_water;
uniform vec3 c_deep;
${COMMON}
void main() {
  vec2 uv = orbUv();
  float radius = 0.84;
  float d = length(uv);
  vec3 s = spherePoint(uv / radius);
  vec2 p = s.xy * p_scale;
  float c = 0.0;
  // Light bent by a moving surface bunches into bright lines: warp the plane
  // a few times and measure how close each point comes to a crest.
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    p += vec2(sin(p.y * 1.3 + p_flow + fi * 1.7), cos(p.x * 1.1 - p_flow * 0.8 + fi * 2.3)) * 0.45;
    c += 0.06 / (abs(sin(p.x * 1.6) + cos(p.y * 1.6)) + 0.08);
  }
  c = pow(c * 0.3, 1.6) * p_bright;
  vec3 col = mix(c_deep * 0.5, c_water, 0.4) + vec3(c) * 0.9;
  col *= 0.5 + 0.5 * lambert(s);
  float inside = discMask(d, radius);
  fragColor = vec4(min(col, vec3(1.0)) * inside, inside);
}
`,
};
