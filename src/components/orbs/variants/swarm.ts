// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Original Nexis shader (not derived from shadercn's non-commercial orbs).
import type { OrbVariant } from "../types";
import { COMMON } from "./glsl";

export const swarm: OrbVariant = {
  key: "swarm",
  label: "Swarm",
  themed: true,
  note: "Points orbiting a sphere, loosening into a cloud while speaking.",
  params: [
    { key: "orbit", label: "Orbit", min: 0, max: 4, default: 0.6, integrate: true },
    { key: "size", label: "Point size", min: 0.01, max: 0.08, default: 0.03 },
    { key: "scatter", label: "Scatter", min: 0, max: 1, default: 0.05 },
    { key: "glow", label: "Glow", min: 0, max: 2, default: 0.8 },
  ],
  colors: [
    { key: "near", label: "Near", default: "theme:--brand|#f0765a" },
    { key: "far", label: "Far", default: "theme:--terminal-ansi-blue|#5b8def" },
  ],
  statePresets: {
    idle: { orbit: 0.6, size: 0.03, scatter: 0.05, glow: 0.8 },
    thinking: { orbit: 1.8, size: 0.026, scatter: 0.15, glow: 1.0 },
    speaking: { orbit: 2.6, size: 0.034, scatter: 0.55, glow: 1.4 },
  },
  fragment: /* glsl */ `
uniform float p_orbit;
uniform float p_size;
uniform float p_scatter;
uniform float p_glow;
uniform vec3 c_near;
uniform vec3 c_far;
${COMMON}
const int POINTS = 56;

void main() {
  vec2 uv = orbUv();
  vec3 col = vec3(0.0);
  float alpha = 0.0;

  for (int i = 0; i < POINTS; i++) {
    float fi = float(i);
    // A Fibonacci lattice spreads the points evenly over the sphere.
    float y = 1.0 - (fi + 0.5) / float(POINTS) * 2.0;
    float ring = sqrt(1.0 - y * y);
    float theta = fi * 2.39996 + p_orbit * (0.6 + hash21(vec2(fi, 1.0)) * 0.8);
    vec3 pt = vec3(cos(theta) * ring, y, sin(theta) * ring);
    // Tilt the whole swarm so the orbits are not all horizontal.
    pt.yz = rot2(0.45) * pt.yz;
    // Capped so a scattered point and its bloom stay inside the canvas;
    // past about 0.9 they are cut off square at its edge.
    float r = min(0.86, 0.66 * (1.0 + p_scatter * (hash21(vec2(fi, 7.0)) - 0.3) * (0.5 + u_outputVol)));
    vec2 screen = pt.xy * r;
    float depth = pt.z * 0.5 + 0.5; // 1 = nearest
    float size = p_size * (0.6 + depth * 0.8);
    float dist = length(uv - screen);
    float dotShape = smoothstep(size, size * 0.3, dist);
    float bloom = exp(-dist * dist / (size * size * 6.0)) * 0.35 * p_glow;
    float w = clamp(dotShape + bloom, 0.0, 1.0) * (0.35 + depth * 0.65);
    col += mix(c_far, c_near, depth) * w;
    alpha += w;
  }

  alpha = clamp(alpha, 0.0, 1.0);
  col = min(col, vec3(1.0));
  fragColor = vec4(col, alpha);
}
`,
};
