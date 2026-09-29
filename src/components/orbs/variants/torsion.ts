// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Original Nexis shader. The idea is from shadcn labs' orb list ("Torsion");
// the code is written from scratch, not derived from their non-commercial
// shaders.
import type { OrbVariant } from "../types";
import { COMMON } from "./glsl";

export const torsion: OrbVariant = {
  key: "torsion",
  label: "Torsion",
  note: "Helical bands wound around the sphere, twisting tighter as it works.",
  themed: true,
  params: [
    { key: "spin", label: "Spin", min: 0, max: 4, default: 0.5, integrate: true },
    { key: "twist", label: "Twist", min: 0, max: 6, default: 2.0 },
    { key: "bands", label: "Bands", min: 2, max: 10, default: 5 },
  ],
  colors: [
    { key: "a", label: "Band", default: "theme:--brand|#f0765a" },
    { key: "b", label: "Gap", default: "theme:--terminal-ansi-magenta|#b36ae2" },
  ],
  statePresets: {
    idle: { spin: 0.5, twist: 2.0, bands: 5 },
    thinking: { spin: 1.5, twist: 3.8, bands: 6 },
    speaking: { spin: 2.6, twist: 2.8, bands: 4 },
  },
  fragment: /* glsl */ `
uniform float p_spin;
uniform float p_twist;
uniform float p_bands;
uniform vec3 c_a;
uniform vec3 c_b;
${COMMON}
void main() {
  vec2 uv = orbUv();
  float radius = 0.84;
  float d = length(uv);
  vec3 s = spherePoint(uv / radius);
  vec3 q = turn(s, 0.0, 0.4);
  // Angle around the vertical axis. Only the front hemisphere is visible, so
  // atan never wraps on screen, and a whole number of bands keeps it seamless.
  float around = atan(q.z, q.x);
  float k = floor(p_bands + 0.5);
  float helix = sin(around * k + q.y * p_twist * 3.0 - p_spin * 2.0);
  float band = smoothstep(-0.2, 0.2, helix);
  vec3 col = mix(c_b * 0.4, c_a, band) * (0.35 + 0.65 * lambert(s));
  col += vec3(pow(lambert(s), 20.0)) * 0.45;
  float inside = discMask(d, radius);
  fragColor = vec4(col * inside, inside);
}
`,
};
