// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Original Nexis shader. The idea is from shadcn labs' orb list ("Falls": a water film rushing down the ball);
// the code is written from scratch, not derived from their non-commercial
// shaders.
import type { OrbVariant } from "../types";
import { COMMON } from "./glsl";

export const falls: OrbVariant = {
  key: "falls",
  label: "Falls",
  note: "A film of water streaming down the ball like a fountain.",
  themed: false,
  params: [
    { key: "flow", label: "Flow", min: 0, max: 6, default: 1.0, integrate: true },
    { key: "streaks", label: "Streaks", min: 6, max: 40, default: 18 },
    { key: "sheen", label: "Sheen", min: 0, max: 1.5, default: 0.7 },
  ],
  colors: [
    { key: "water", label: "Water", default: "#6fd6ff" },
    { key: "deep", label: "Deep", default: "#1b5f9e" },
  ],
  statePresets: {
    idle: { flow: 1.0, streaks: 18, sheen: 0.7 },
    thinking: { flow: 2.6, streaks: 24, sheen: 0.9 },
    speaking: { flow: 4.2, streaks: 20, sheen: 1.3 },
  },
  fragment: /* glsl */ `
uniform float p_flow;
uniform float p_streaks;
uniform float p_sheen;
uniform vec3 c_water;
uniform vec3 c_deep;
${COMMON}
void main() {
  vec2 uv = orbUv();
  float radius = 0.84;
  float d = length(uv);
  vec3 s = spherePoint(uv / radius);
  // Streaks are noise stretched along the flow (down the ball), scrolled by
  // the flow clock.
  float x = s.x / (0.6 + s.z * 0.4);
  float streak = vnoise(vec2(x * p_streaks, s.y * 2.0 + p_flow * 1.5));
  streak = mix(streak, vnoise(vec2(x * p_streaks * 2.1, s.y * 3.0 + p_flow * 2.3)), 0.5);
  vec3 col = mix(c_deep * 0.55, c_water, smoothstep(0.35, 0.8, streak));
  float light = lambert(s);
  col *= 0.45 + 0.55 * light;
  col += vec3(pow(light, 16.0)) * p_sheen * 0.8;
  col += c_water * pow(1.0 - s.z, 3.0) * 0.4;
  float inside = discMask(d, radius);
  fragColor = vec4(col * inside, inside);
}
`,
};
