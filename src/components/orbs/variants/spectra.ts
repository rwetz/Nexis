// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Original Nexis shader. The idea is from shadcn labs' orb list ("Spectra": torn rings of rainbow light as latitudes);
// the code is written from scratch, not derived from their non-commercial
// shaders.
import type { OrbVariant } from "../types";
import { COMMON } from "./glsl";

export const spectra: OrbVariant = {
  key: "spectra",
  label: "Spectra",
  note: "Rainbow latitudes wrapped around the ball, torn in places.",
  themed: false,
  params: [
    { key: "spin", label: "Spin", min: 0, max: 3, default: 0.4, integrate: true },
    { key: "bands", label: "Bands", min: 3, max: 14, default: 7 },
    { key: "tear", label: "Tears", min: 0, max: 1, default: 0.4 },
  ],
  colors: [
    { key: "tint", label: "Tint", default: "#ffffff" },
  ],
  statePresets: {
    idle: { spin: 0.4, bands: 7, tear: 0.4 },
    thinking: { spin: 1.1, bands: 10, tear: 0.55 },
    speaking: { spin: 1.8, bands: 8, tear: 0.75 },
  },
  fragment: /* glsl */ `
uniform float p_spin;
uniform float p_bands;
uniform float p_tear;
uniform vec3 c_tint;
${COMMON}
void main() {
  vec2 uv = orbUv();
  float radius = 0.84;
  float d = length(uv);
  vec3 s = spherePoint(uv / radius);
  vec3 q = turn(s, p_spin, 0.5);
  float lat = q.y * 0.5 + 0.5;
  float idx = floor(lat * p_bands);
  float within = fract(lat * p_bands);
  vec3 col = spectrum(idx / p_bands) * c_tint;
  // Tears: patches where a band's light is missing, drifting with the spin.
  float rip = vnoise(vec2(q.x * 4.0 + p_spin, idx * 3.7));
  float torn = smoothstep(1.0 - p_tear * 0.6, 1.05 - p_tear * 0.6, rip);
  float band = smoothstep(0.0, 0.12, within) * smoothstep(1.0, 0.88, within);
  float light = 0.4 + 0.6 * lambert(s);
  float inside = discMask(d, radius);
  float alpha = inside * mix(1.0, 0.18, torn) * (0.55 + 0.45 * band);
  fragColor = vec4(col * light * alpha, alpha);
}
`,
};
