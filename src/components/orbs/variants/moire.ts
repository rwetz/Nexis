// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Original Nexis shader. The idea is from shadcn labs' orb list ("Moiré");
// the code is written from scratch, not derived from their non-commercial
// shaders.
import type { OrbVariant } from "../types";
import { COMMON } from "./glsl";

export const moire: OrbVariant = {
  key: "moire",
  label: "Moiré",
  note: "Two turning line gratings beating against each other.",
  themed: true,
  params: [
    { key: "turn", label: "Turn", min: 0, max: 3, default: 0.25, integrate: true },
    { key: "freq", label: "Lines", min: 10, max: 70, default: 20 },
    { key: "skew", label: "Skew", min: 0, max: 0.4, default: 0.05 },
  ],
  colors: [
    { key: "ink", label: "Ink", default: "theme:--brand|#f0765a" },
    { key: "paper", label: "Paper", default: "theme:--terminal-ansi-blue|#5b8def" },
  ],
  statePresets: {
    idle: { turn: 0.25, freq: 20, skew: 0.05 },
    thinking: { turn: 0.8, freq: 26, skew: 0.09 },
    speaking: { turn: 1.4, freq: 18, skew: 0.16 },
  },
  fragment: /* glsl */ `
uniform float p_turn;
uniform float p_freq;
uniform float p_skew;
uniform vec3 c_ink;
uniform vec3 c_paper;
${COMMON}
void main() {
  vec2 uv = orbUv();
  float radius = 0.84;
  float d = length(uv);
  // Bulge the plane slightly so the pattern sits on a dome.
  vec2 p = uv * (1.0 + 0.35 * (1.0 - sqrt(max(0.0, 1.0 - d * d))));
  vec2 a = rot2(p_turn * 0.4) * p;
  vec2 b = rot2(-p_turn * 0.4 + p_skew) * p;
  float g1 = 0.5 + 0.5 * sin(a.x * p_freq);
  float g2 = 0.5 + 0.5 * sin(b.x * p_freq * 1.04);
  // The moire is the product: fine lines cancel, the broad beats remain.
  float m = g1 * g2;
  vec3 col = mix(c_paper * 0.25, c_ink, smoothstep(0.15, 0.85, m));
  float inside = discMask(d, radius);
  fragColor = vec4(col * inside, inside);
}
`,
};
