// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Original Nexis shader. The idea is from shadcn labs' orb list ("Nimbus": light diffusing through a cloud);
// the code is written from scratch, not derived from their non-commercial
// shaders.
import type { OrbVariant } from "../types";
import { COMMON } from "./glsl";

export const nimbus: OrbVariant = {
  key: "nimbus",
  label: "Nimbus",
  note: "A backlit cloud with a silver lining and light glowing through.",
  themed: false,
  params: [
    { key: "drift", label: "Drift", min: 0, max: 3, default: 0.3, integrate: true },
    { key: "density", label: "Density", min: 0.3, max: 1.8, default: 1.0 },
    { key: "light", label: "Light", min: 0.2, max: 2, default: 1.0 },
  ],
  colors: [
    { key: "light", label: "Light", default: "#ffb347" },
    { key: "cloud", label: "Cloud", default: "#8e9bb0" },
  ],
  statePresets: {
    idle: { drift: 0.3, density: 1.0, light: 1.0 },
    thinking: { drift: 0.9, density: 1.3, light: 1.1 },
    speaking: { drift: 1.6, density: 0.9, light: 1.7 },
  },
  fragment: /* glsl */ `
uniform float p_drift;
uniform float p_density;
uniform float p_light;
uniform vec3 c_light;
uniform vec3 c_cloud;
${COMMON}
void main() {
  vec2 uv = orbUv();
  float d = length(uv);
  float body = smoothstep(0.86, 0.35, d + (fbm(uv * 2.5 + p_drift * 0.3) - 0.5) * 0.35);
  float dens = fbm(uv * 3.2 + vec2(p_drift * 0.4, -p_drift * 0.2)) * p_density;
  float cloud = clamp(body * (0.55 + dens), 0.0, 1.0);
  // Thin parts glow with the light that made it through.
  float through = (1.0 - dens) * body;
  float lining = smoothstep(0.2, 0.0, abs(cloud - 0.35)) * body * 0.6;
  vec3 col = c_cloud * (0.55 + 0.45 * dens) + c_light * (through * 0.8 + lining) * p_light;
  col += c_light * exp(-d * d * 10.0) * 0.4 * p_light;
  fragColor = vec4(min(col, vec3(1.0)) * cloud, cloud);
}
`,
};
