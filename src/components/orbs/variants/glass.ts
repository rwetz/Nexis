// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Original Nexis shader (not derived from shadercn's non-commercial orbs).
import type { OrbVariant } from "../types";
import { COMMON } from "./glsl";

export const glass: OrbVariant = {
  key: "glass",
  label: "Glass",
  themed: true,
  note: "A clear sphere with a bright rim and slow caustic bands inside.",
  params: [
    { key: "flow", label: "Flow", min: 0, max: 3, default: 0.5, integrate: true },
    { key: "bands", label: "Bands", min: 1, max: 12, default: 4 },
    { key: "rim", label: "Rim", min: 1, max: 6, default: 3 },
    { key: "glow", label: "Glow", min: 0, max: 1.5, default: 0.6 },
  ],
  colors: [
    { key: "core", label: "Core", default: "theme:--brand|#f0765a" },
    { key: "edge", label: "Edge", default: "theme:--terminal-ansi-blue|#5b8def" },
  ],
  statePresets: {
    idle: { flow: 0.5, bands: 4, rim: 3, glow: 0.6 },
    thinking: { flow: 1.3, bands: 6.5, rim: 2.6, glow: 0.8 },
    speaking: { flow: 2.2, bands: 5, rim: 2.2, glow: 1.15 },
  },
  fragment: /* glsl */ `
uniform float p_flow;
uniform float p_bands;
uniform float p_rim;
uniform float p_glow;
uniform vec3 c_core;
uniform vec3 c_edge;
${COMMON}
void main() {
  vec2 uv = orbUv();
  float radius = 0.84 + u_outputVol * 0.04;
  float d = length(uv);
  float inside = discMask(d, radius);
  vec2 p = uv / radius;
  float z = sqrt(max(0.0, 1.0 - dot(p, p)));

  // Bands run through the sphere along a slowly turning direction, bent by
  // noise and by the sphere's own depth, which is what reads as refraction.
  vec2 q = rot2(p_flow * 0.35) * p;
  float warp = fbm(q * 2.0 + vec2(p_flow * 0.6, -p_flow * 0.4));
  float band = sin((q.x + warp * 0.9 + z * 0.8) * p_bands * 3.14159);
  band = smoothstep(0.2, 1.0, band * 0.5 + 0.5);

  float fresnel = pow(1.0 - z, p_rim);
  vec3 col = mix(c_edge * 0.18, c_core, band * (0.35 + 0.65 * z));
  col += c_edge * fresnel * (0.9 + p_glow);
  // A soft highlight up and to the left sells the curvature.
  float spec = pow(max(0.0, dot(normalize(vec3(p, z)), normalize(vec3(-0.45, 0.55, 0.7)))), 24.0);
  col += vec3(spec) * 0.8;

  float alpha = inside * clamp(0.55 + band * 0.3 + fresnel + spec, 0.0, 1.0);
  // A faint halo outside the edge, stronger while speaking.
  float halo = exp(-max(0.0, d - radius) * 14.0) * (1.0 - inside) * 0.35 * p_glow;
  col = col * alpha + c_edge * halo;
  fragColor = vec4(col, max(alpha, halo));
}
`,
};
