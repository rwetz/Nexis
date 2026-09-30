// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Original Nexis shader (not derived from shadercn's non-commercial orbs).
import type { OrbVariant } from "../types";
import { COMMON } from "./glsl";

export const rings: OrbVariant = {
  key: "rings",
  label: "Rings",
  themed: true,
  note: "Ripples moving outward from the centre, tighter and quicker while thinking.",
  params: [
    { key: "phase", label: "Speed", min: 0, max: 6, default: 1.0, integrate: true },
    { key: "freq", label: "Rings", min: 4, max: 40, default: 12 },
    { key: "sharp", label: "Sharpness", min: 1, max: 12, default: 4 },
    { key: "wobble", label: "Wobble", min: 0, max: 1, default: 0.15 },
  ],
  colors: [
    { key: "ink", label: "Rings", default: "theme:--brand|#f0765a" },
    { key: "base", label: "Base", default: "theme:--terminal-ansi-yellow|#e5b53a" },
  ],
  statePresets: {
    idle: { phase: 1.0, freq: 12, sharp: 4, wobble: 0.15 },
    thinking: { phase: 3.2, freq: 22, sharp: 7, wobble: 0.35 },
    speaking: { phase: 4.5, freq: 14, sharp: 3, wobble: 0.6 },
  },
  fragment: /* glsl */ `
uniform float p_phase;
uniform float p_freq;
uniform float p_sharp;
uniform float p_wobble;
uniform vec3 c_ink;
uniform vec3 c_base;
${COMMON}
void main() {
  vec2 uv = orbUv();
  float radius = 0.84 + u_outputVol * 0.03;
  float d = length(uv);
  // The ripple front is bent by noise sampled along the direction from the
  // centre, so the rings breathe instead of being perfect circles. Sampling
  // by direction rather than by atan() angle matters: the angle jumps from
  // -pi to pi on the left, and noise read from it leaves a visible seam.
  vec2 dir = uv / max(d, 1e-4);
  float bend = (vnoise(dir * 1.8 + vec2(p_phase * 0.4, -p_phase * 0.3)) - 0.5) * p_wobble * 0.25;
  float wave = sin((d + bend) * p_freq * 3.14159 - p_phase * 3.0);
  float ring = pow(wave * 0.5 + 0.5, p_sharp);

  // Between the rings is a light tint of the base colour, not a darkened
  // one: a dark film reads as grey on a light theme.
  vec3 col = mix(c_base, c_ink, ring);
  // Rings fade toward the rim and brighten at the centre.
  float falloff = mix(1.0, 0.35, smoothstep(0.0, radius, d));
  float inside = discMask(d, radius);
  float alpha = inside * clamp(0.14 + ring * 0.86, 0.0, 1.0) * falloff;
  fragColor = vec4(col * alpha, alpha);
}
`,
};
