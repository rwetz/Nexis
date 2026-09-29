// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Original Nexis shader (not derived from shadercn's non-commercial orbs).
import type { OrbVariant } from "../types";
import { COMMON } from "./glsl";

export const nebula: OrbVariant = {
  key: "nebula",
  label: "Nebula",
  note: "A glowing core with wisps swirling around it and a few sparks.",
  params: [
    { key: "swirl", label: "Swirl", min: 0, max: 3, default: 0.35, integrate: true },
    { key: "core", label: "Core", min: 0.5, max: 8, default: 3.5 },
    { key: "density", label: "Density", min: 0.2, max: 2, default: 0.9 },
    { key: "sparks", label: "Sparks", min: 0, max: 1, default: 0.4 },
  ],
  colors: [
    { key: "core", label: "Core", default: "theme:--terminal-ansi-cyan|#4fd1c5" },
    { key: "dust", label: "Dust", default: "theme:--brand|#f0765a" },
  ],
  statePresets: {
    idle: { swirl: 0.35, core: 3.5, density: 0.9, sparks: 0.4 },
    thinking: { swirl: 1.0, core: 4.5, density: 1.25, sparks: 0.7 },
    speaking: { swirl: 1.8, core: 2.4, density: 1.5, sparks: 1.0 },
  },
  fragment: /* glsl */ `
uniform float p_swirl;
uniform float p_core;
uniform float p_density;
uniform float p_sparks;
uniform vec3 c_core;
uniform vec3 c_dust;
${COMMON}
void main() {
  vec2 uv = orbUv();
  float radius = 0.86;
  float d = length(uv);

  // Wisps: noise sampled in a frame that turns faster near the centre, so
  // the dust shears into arms instead of rotating as one disc.
  float twist = p_swirl + (1.0 - d) * 1.6;
  vec2 w = rot2(twist) * uv;
  float dust = fbm(w * 2.4 + vec2(u_anim * 0.2, 0.0));
  dust = smoothstep(0.35, 0.9, dust) * p_density;

  float core = exp(-d * d * p_core) * (1.0 + u_outputVol * 0.6);
  vec2 cell = floor((rot2(p_swirl * 0.5) * uv) * 28.0);
  float spark = step(0.985, hash21(cell)) * p_sparks
              * (0.5 + 0.5 * sin(u_time * 6.0 + hash21(cell + 3.1) * 40.0));

  vec3 col = c_core * core + c_dust * dust * (1.0 - core * 0.5) + vec3(spark);
  float fade = smoothstep(radius, radius * 0.4, d);
  float alpha = clamp(core + dust * 0.8 + spark, 0.0, 1.0) * fade * discMask(d, radius);
  fragColor = vec4(col * fade * discMask(d, radius), alpha);
}
`,
};
