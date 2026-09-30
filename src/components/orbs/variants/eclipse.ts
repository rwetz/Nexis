// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Original Nexis shader. The idea is from shadcn labs' orb list ("Ecliptic");
// the code is written from scratch, not derived from their non-commercial
// shaders.
import type { OrbVariant } from "../types";
import { COMMON } from "./glsl";

export const eclipse: OrbVariant = {
  key: "eclipse",
  label: "Eclipse",
  note: "A dark disc crowned by a streaming corona, with a travelling flare.",
  themed: false,
  params: [
    { key: "drift", label: "Drift", min: 0, max: 3, default: 0.3, integrate: true },
    { key: "corona", label: "Corona", min: 0.3, max: 2, default: 1.0 },
    { key: "flare", label: "Flare", min: 0, max: 1.5, default: 0.6 },
  ],
  colors: [
    { key: "corona", label: "Corona", default: "#f5c451" },
    { key: "flare", label: "Flare", default: "#ff8a5c" },
  ],
  statePresets: {
    idle: { drift: 0.3, corona: 1.0, flare: 0.6 },
    thinking: { drift: 0.9, corona: 1.3, flare: 0.8 },
    speaking: { drift: 1.6, corona: 1.8, flare: 1.3 },
  },
  fragment: /* glsl */ `
uniform float p_drift;
uniform float p_corona;
uniform float p_flare;
uniform vec3 c_corona;
uniform vec3 c_flare;
${COMMON}
void main() {
  vec2 uv = orbUv();
  float d = length(uv);
  float moon = 0.56;
  vec2 dir = uv / max(d, 1e-4);
  // Streamers: noise sampled by direction from the centre, stretched outward.
  float streak = fbm(dir * 3.0 + vec2(p_drift * 0.5, -p_drift * 0.3));
  float falloff = exp(-(d - moon) * (5.5 - p_corona * 1.6));
  float corona = max(0.0, falloff * (0.45 + streak) * p_corona) * step(moon, d);
  // A bright bead that travels the rim: the diamond ring.
  vec2 beadPos = vec2(cos(p_drift * 1.3), sin(p_drift * 1.3)) * moon;
  float bead = exp(-length(uv - beadPos) * 30.0) * p_flare * 1.5;
  vec3 col = c_corona * corona + c_flare * bead;
  float disc = discMask(d, moon);
  vec3 moonCol = vec3(0.03, 0.03, 0.05) + c_corona * 0.12 * smoothstep(moon * 0.7, moon, d);
  col = mix(col, moonCol, disc);
  float alpha = clamp(max(disc, corona + bead), 0.0, 1.0) * discMask(d, 0.98);
  fragColor = vec4(col * alpha, alpha);
}
`,
};
