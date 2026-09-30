// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Original Nexis shader. The idea is from shadcn labs' orb list ("Galaxy": a galaxy of gas and dust inside the ball);
// the code is written from scratch, not derived from their non-commercial
// shaders.
import type { OrbVariant } from "../types";
import { COMMON } from "./glsl";

export const galaxy: OrbVariant = {
  key: "galaxy",
  label: "Galaxy",
  note: "A tilted spiral galaxy: bright core, dusty arms and scattered stars.",
  themed: false,
  params: [
    { key: "spin", label: "Spin", min: 0, max: 3, default: 0.3, integrate: true },
    { key: "wind", label: "Winding", min: 1, max: 5, default: 2.6 },
    { key: "dust", label: "Dust", min: 0, max: 1.5, default: 0.7 },
  ],
  colors: [
    { key: "arm", label: "Arms", default: "#4d74ff" },
    { key: "core", label: "Core", default: "#ffc857" },
  ],
  statePresets: {
    idle: { spin: 0.3, wind: 2.6, dust: 0.7 },
    thinking: { spin: 0.9, wind: 3.2, dust: 0.9 },
    speaking: { spin: 1.6, wind: 2.2, dust: 1.2 },
  },
  fragment: /* glsl */ `
uniform float p_spin;
uniform float p_wind;
uniform float p_dust;
uniform vec3 c_arm;
uniform vec3 c_core;
${COMMON}
void main() {
  vec2 uv = orbUv();
  float d = length(uv);
  // Tilt the disc so the galaxy is seen at an angle.
  vec2 p = rot2(0.5) * uv;
  p.y *= 1.8;
  float r = length(p);
  float theta = atan(p.y, p.x);
  // Two logarithmic arms. 2 * theta is a whole multiple, so no seam where the
  // angle wraps.
  float arms = 0.5 + 0.5 * cos(2.0 * (theta - log(r + 0.05) * p_wind) - p_spin * 2.0);
  arms = pow(arms, 3.0) * exp(-r * 2.4);
  float dust = fbm(p * 4.0 + vec2(p_spin, 0.0)) * p_dust;
  float core = exp(-r * r * 22.0);
  vec2 cellId = floor(uv * 34.0);
  float star = step(0.992, hash21(cellId)) * (0.5 + 0.5 * sin(u_time * 5.0 + hash21(cellId + 2.0) * 30.0));
  vec3 col = c_arm * arms * (2.2 - dust * 0.6) + c_core * core * 1.2 + vec3(star) * 0.9 + c_arm * dust * arms * 0.5;
  float edge = discMask(d, 0.95);
  float alpha = clamp(arms * 2.4 + dust * arms + core + star, 0.0, 1.0) * edge;
  fragColor = vec4(min(col, vec3(1.0)) * edge, alpha);
}
`,
};
