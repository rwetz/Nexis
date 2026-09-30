// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Original Nexis shader. The idea is from shadcn labs' orb list ("Hydrogen": a quantum orbital in rainbow chroma);
// the code is written from scratch, not derived from their non-commercial
// shaders.
import type { OrbVariant } from "../types";
import { COMMON } from "./glsl";

export const orbital: OrbVariant = {
  key: "orbital",
  label: "Orbital",
  note: "A six-lobed electron cloud, shimmering in rainbow chroma.",
  themed: false,
  params: [
    { key: "spin", label: "Spin", min: 0, max: 3, default: 0.35, integrate: true },
    { key: "lobes", label: "Lobes", min: 2, max: 5, default: 3 },
    { key: "fuzz", label: "Fuzz", min: 0, max: 1, default: 0.5 },
  ],
  colors: [
    { key: "core", label: "Core", default: "#ffffff" },
  ],
  statePresets: {
    idle: { spin: 0.35, lobes: 3, fuzz: 0.5 },
    thinking: { spin: 1.0, lobes: 3, fuzz: 0.75 },
    speaking: { spin: 1.8, lobes: 2, fuzz: 0.9 },
  },
  fragment: /* glsl */ `
uniform float p_spin;
uniform float p_lobes;
uniform float p_fuzz;
uniform vec3 c_core;
${COMMON}
void main() {
  vec2 uv = orbUv();
  float d = length(uv);
  vec2 p = rot2(p_spin) * uv;
  // |cos(k * theta)| with k a whole number, so there is no seam where the
  // angle wraps.
  float k = floor(p_lobes + 0.5);
  float theta = atan(p.y, p.x);
  float lobe = pow(abs(cos(k * theta)), 1.5);
  float cloud = lobe * exp(-pow(d - 0.45, 2.0) * 14.0);
  float grain = vnoise(uv * 38.0 + vec2(p_spin * 6.0, 0.0));
  cloud *= mix(1.0, 0.4 + grain, p_fuzz);
  float core = exp(-d * d * 60.0);
  // Hue by distance from the nucleus only: a hue by angle would seam.
  vec3 col = spectrum(d * 1.3 + p_spin * 0.1) * cloud * 1.6 + c_core * core;
  float edge = discMask(d, 0.95);
  float alpha = clamp(cloud * 1.3 + core, 0.0, 1.0) * edge;
  fragColor = vec4(min(col, vec3(1.0)) * edge, alpha);
}
`,
};
