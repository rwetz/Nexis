// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Original Nexis shader. The idea is from shadcn labs' orb list ("Iridescent");
// the code is written from scratch, not derived from their non-commercial
// shaders.
import type { OrbVariant } from "../types";
import { COMMON } from "./glsl";

export const iridescent: OrbVariant = {
  key: "iridescent",
  label: "Iridescent",
  note: "A soap-film sheen: interference colours sliding over a pale sphere.",
  themed: false,
  params: [
    { key: "flow", label: "Flow", min: 0, max: 3, default: 0.35, integrate: true },
    { key: "film", label: "Film", min: 0.5, max: 4, default: 1.6 },
    { key: "sheen", label: "Sheen", min: 0, max: 1.5, default: 0.8 },
  ],
  colors: [
    { key: "base", label: "Base", default: "#f4f6fb" },
  ],
  statePresets: {
    idle: { flow: 0.35, film: 1.6, sheen: 0.8 },
    thinking: { flow: 1.0, film: 2.4, sheen: 1.0 },
    speaking: { flow: 1.7, film: 2.0, sheen: 1.4 },
  },
  fragment: /* glsl */ `
uniform float p_flow;
uniform float p_film;
uniform float p_sheen;
uniform vec3 c_base;
${COMMON}
void main() {
  vec2 uv = orbUv();
  float radius = 0.84;
  float d = length(uv);
  vec3 s = spherePoint(uv / radius);
  // The colour of a thin film depends on its thickness and the viewing angle;
  // the thickness drifts like a real bubble's.
  float thickness = fbm(s.xy * 1.8 + vec2(0.0, p_flow * 0.5)) * p_film;
  float view = 1.0 - s.z;
  vec3 film = spectrum(thickness + view * 0.8);
  float fres = pow(view, 2.0);
  vec3 col = mix(c_base, film, clamp(0.25 + fres * p_sheen + 0.2 * p_sheen, 0.0, 1.0));
  col *= 0.75 + 0.25 * lambert(s);
  col += vec3(pow(lambert(s), 30.0)) * 0.7;
  float inside = discMask(d, radius);
  float alpha = inside * (0.7 + 0.3 * fres);
  fragColor = vec4(col * alpha, alpha);
}
`,
};
