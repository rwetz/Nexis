// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Original Nexis shader. The idea is from shadcn labs' orb list ("Rocaille": ornate scrollwork on a rolling dome);
// the code is written from scratch, not derived from their non-commercial
// shaders.
import type { OrbVariant } from "../types";
import { COMMON } from "./glsl";

export const scroll: OrbVariant = {
  key: "scroll",
  label: "Scroll",
  note: "Gilded filigree curling across a slowly rolling dome.",
  themed: true,
  params: [
    { key: "roll", label: "Roll", min: 0, max: 3, default: 0.3, integrate: true },
    { key: "detail", label: "Detail", min: 2, max: 12, default: 5 },
    { key: "curl", label: "Curl", min: 0, max: 3, default: 1.2 },
  ],
  colors: [
    { key: "gold", label: "Gilt", default: "theme:--terminal-ansi-yellow|#e5b53a" },
    { key: "ground", label: "Ground", default: "theme:--brand|#f0765a" },
  ],
  statePresets: {
    idle: { roll: 0.3, detail: 5, curl: 1.2 },
    thinking: { roll: 0.9, detail: 7, curl: 1.8 },
    speaking: { roll: 1.6, detail: 6, curl: 2.6 },
  },
  fragment: /* glsl */ `
uniform float p_roll;
uniform float p_detail;
uniform float p_curl;
uniform vec3 c_gold;
uniform vec3 c_ground;
${COMMON}
void main() {
  vec2 uv = orbUv();
  float radius = 0.84;
  float d = length(uv);
  vec3 s = spherePoint(uv / radius);
  vec3 q = turn(s, p_roll, 0.35);
  // Scrolls are contour lines of a curling field: thin where the field
  // crosses each level, so they read as engraved lines rather than bands.
  float f = fbm(q.xy * 2.2 + q.z * 1.3 + vec2(0.0, p_curl * 0.3)) + 0.35 * sin(q.x * 3.0 + q.y * 2.0 + p_curl);
  float line = 1.0 - smoothstep(0.06, 0.16, abs(fract(f * p_detail) - 0.5));
  float light = 0.35 + 0.65 * lambert(s);
  vec3 col = mix(c_ground * 0.6, c_gold * 1.15, line) * light;
  col += vec3(pow(lambert(s), 18.0)) * 0.5;
  float inside = discMask(d, radius);
  fragColor = vec4(col * inside, inside);
}
`,
};
