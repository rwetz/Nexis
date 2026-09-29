// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Original Nexis shader (not derived from shadercn's non-commercial orbs).
import type { OrbVariant } from "../types";
import { COMMON } from "./glsl";

export const plasma: OrbVariant = {
  key: "plasma",
  label: "Plasma",
  themed: true,
  note: "Warped, folding colour held inside a soft disc.",
  params: [
    { key: "flow", label: "Flow", min: 0, max: 3, default: 0.4, integrate: true },
    { key: "warp", label: "Warp", min: 0, max: 4, default: 1.4 },
    { key: "scale", label: "Scale", min: 0.5, max: 5, default: 1.8 },
    { key: "glow", label: "Glow", min: 0, max: 1.5, default: 0.5 },
  ],
  colors: [
    { key: "a", label: "Primary", default: "theme:--brand|#f0765a" },
    { key: "b", label: "Secondary", default: "theme:--terminal-ansi-magenta|#b36ae2" },
  ],
  statePresets: {
    idle: { flow: 0.4, warp: 1.4, scale: 1.8, glow: 0.5 },
    thinking: { flow: 1.1, warp: 2.4, scale: 2.3, glow: 0.7 },
    speaking: { flow: 2.0, warp: 3.0, scale: 2.0, glow: 1.1 },
  },
  fragment: /* glsl */ `
uniform float p_flow;
uniform float p_warp;
uniform float p_scale;
uniform float p_glow;
uniform vec3 c_a;
uniform vec3 c_b;
${COMMON}
void main() {
  vec2 uv = orbUv();
  float radius = 0.82 + u_outputVol * 0.05;
  float d = length(uv);
  vec2 p = uv * p_scale;

  // Two rounds of domain warping: the field is sampled where another field
  // points, which is what makes it fold rather than just scroll.
  vec2 q = vec2(fbm(p + vec2(0.0, p_flow)), fbm(p + vec2(5.2, 1.3) - p_flow * 0.7));
  vec2 r = vec2(fbm(p + p_warp * q + vec2(1.7, 9.2) + p_flow * 0.3),
                fbm(p + p_warp * q + vec2(8.3, 2.8) - p_flow * 0.2));
  float f = fbm(p + p_warp * r);

  vec3 col = mix(c_b, c_a, smoothstep(0.25, 0.75, f));
  col = mix(col, vec3(1.0), pow(smoothstep(0.6, 0.95, f), 3.0) * 0.6);

  // Soft edge: density falls off toward the rim instead of a hard cut.
  float body = smoothstep(radius, radius * 0.55, d);
  // Mostly opaque: a translucent plasma reads as a pale film on a light theme.
  float alpha = body * (0.82 + 0.18 * f) * discMask(d, radius);
  float halo = exp(-max(0.0, d - radius * 0.8) * 7.0) * 0.25 * p_glow * (1.0 - body);
  fragColor = vec4(col * alpha + c_a * halo, max(alpha, halo));
}
`,
};
