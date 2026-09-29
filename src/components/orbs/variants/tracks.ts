// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Original Nexis shader. The idea is from shadcn labs' orb list ("Muons": an iridescent particle-track web);
// the code is written from scratch, not derived from their non-commercial
// shaders.
import type { OrbVariant } from "../types";
import { COMMON } from "./glsl";

export const tracks: OrbVariant = {
  key: "tracks",
  label: "Tracks",
  note: "Bubble-chamber tracks: spiralling arcs appearing and fading in the glass.",
  themed: false,
  params: [
    { key: "time", label: "Pace", min: 0, max: 4, default: 0.5, integrate: true },
    { key: "count", label: "Tracks", min: 4, max: 14, default: 9 },
    { key: "fade", label: "Fade", min: 0.2, max: 1, default: 0.6 },
  ],
  colors: [
    { key: "glass", label: "Glass", default: "#7aa2ff" },
  ],
  statePresets: {
    idle: { time: 0.5, count: 9, fade: 0.6 },
    thinking: { time: 1.5, count: 12, fade: 0.5 },
    speaking: { time: 2.6, count: 14, fade: 0.8 },
  },
  fragment: /* glsl */ `
uniform float p_time;
uniform float p_count;
uniform float p_fade;
uniform vec3 c_glass;
${COMMON}
void main() {
  vec2 uv = orbUv();
  float radius = 0.84;
  float d = length(uv);
  vec3 col = vec3(0.0);
  float a = 0.0;
  int n = int(floor(p_count + 0.5));
  for (int i = 0; i < 14; i++) {
    if (i >= n) break;
    float fi = float(i);
    // Each track lives one cycle of its own clock, then is reborn elsewhere.
    float clock = p_time * 0.3 + hash21(vec2(fi, 3.0));
    float life = fract(clock);
    vec2 seed = vec2(fi, floor(clock));
    vec2 c = (vec2(hash21(seed), hash21(seed + 1.7)) - 0.5) * 1.2;
    float r = 0.15 + hash21(seed + 4.1) * 0.6;
    float ring = abs(length(uv - c) - r * (0.6 + 0.4 * life));
    float line = exp(-ring * 180.0) * (1.0 - life) * p_fade * 1.4;
    col += spectrum(hash21(seed + 9.0) + life * 0.2) * line;
    a += line;
  }
  float inside = discMask(d, radius);
  float rim = pow(smoothstep(radius * 0.6, radius, d), 3.0);
  col = (col + c_glass * rim * 0.5) * inside;
  float alpha = inside * clamp(0.12 + a + rim * 0.5, 0.0, 1.0);
  fragColor = vec4(min(col, vec3(1.0)), alpha);
}
`,
};
