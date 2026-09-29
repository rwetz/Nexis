// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Original Nexis shader (not derived from shadercn's non-commercial orbs).
import type { OrbVariant } from "../types";
import { COMMON } from "./glsl";

export const dither: OrbVariant = {
  key: "dither",
  label: "Dither",
  note: "A lit sphere drawn in ordered dither, like an old monochrome screen.",
  params: [
    { key: "light", label: "Light", min: 0, max: 3, default: 0.4, integrate: true },
    { key: "levels", label: "Levels", min: 2, max: 6, default: 2 },
    { key: "pixel", label: "Pixel size", min: 1, max: 8, default: 3 },
    { key: "bumps", label: "Surface", min: 0, max: 1, default: 0.35 },
  ],
  colors: [
    { key: "lit", label: "Lit", default: "theme:--terminal-ansi-green|#4ade80" },
    { key: "shade", label: "Shade", default: "theme:--terminal-ansi-bright-black|#3f4552" },
  ],
  statePresets: {
    // Two levels is one-bit dither, the look this orb is for: with more,
    // most of the sphere lands on a mid-tone and the pattern blurs away.
    idle: { light: 0.4, levels: 2, pixel: 3, bumps: 0.35 },
    thinking: { light: 1.2, levels: 2, pixel: 3, bumps: 0.6 },
    speaking: { light: 2.0, levels: 3, pixel: 4, bumps: 0.85 },
  },
  fragment: /* glsl */ `
uniform float p_light;
uniform float p_levels;
uniform float p_pixel;
uniform float p_bumps;
uniform vec3 c_lit;
uniform vec3 c_shade;
${COMMON}
// Ordered-dither threshold for a 4x4 Bayer matrix, in 0..1.
float bayer4(vec2 cell) {
  vec2 c = mod(cell, 4.0);
  int i = int(c.x) + int(c.y) * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}

void main() {
  // Snap to a coarse pixel grid first: the whole look depends on it.
  float px = max(1.0, floor(p_pixel + 0.5));
  vec2 cell = floor(gl_FragCoord.xy / px);
  vec2 snapped = (cell + 0.5) * px;
  vec2 uv = (snapped * 2.0 - u_res) / min(u_res.x, u_res.y);

  float radius = 0.84;
  float d = length(uv);
  vec2 p = uv / radius;
  float z = sqrt(max(0.0, 1.0 - dot(p, p)));
  vec3 n = normalize(vec3(p, z));
  // Surface noise perturbs the normal, which makes the shading crawl.
  n.xy += (vec2(fbm(p * 3.0 + u_anim), fbm(p * 3.0 - u_anim + 4.0)) - 0.5) * p_bumps;
  n = normalize(n);

  vec3 lightDir = normalize(vec3(cos(p_light), sin(p_light * 0.7) * 0.6 + 0.3, 0.8));
  float lum = clamp(dot(n, lightDir), 0.0, 1.0) * (0.85 + u_outputVol * 0.3);

  float steps = floor(p_levels + 0.5) - 1.0;
  float level = floor(lum * steps + bayer4(cell)) / steps;
  vec3 col = mix(c_shade, c_lit, clamp(level, 0.0, 1.0));

  // A hard, pixel-snapped edge is part of the look, so no antialiasing here.
  float inside = step(d, radius);
  fragColor = vec4(col * inside, inside);
}
`,
};
