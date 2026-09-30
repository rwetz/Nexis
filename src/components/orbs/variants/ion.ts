// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Original Nexis shader. The idea is from shadcn labs' orb list ("Ion": a plasma globe with crawling lightning filaments);
// the code is written from scratch, not derived from their non-commercial
// shaders.
import type { OrbVariant } from "../types";
import { COMMON } from "./glsl";

export const ion: OrbVariant = {
  key: "ion",
  label: "Ion",
  note: "A plasma globe: lightning filaments crawling from the core to the glass.",
  themed: false,
  params: [
    { key: "crawl", label: "Crawl", min: 0, max: 4, default: 0.6, integrate: true },
    { key: "arcs", label: "Arcs", min: 2, max: 8, default: 5 },
    { key: "heat", label: "Heat", min: 0, max: 1.5, default: 0.7 },
  ],
  colors: [
    { key: "arc", label: "Arc", default: "#d16bff" },
    { key: "glass", label: "Glass", default: "#6c8cff" },
  ],
  statePresets: {
    idle: { crawl: 0.6, arcs: 5, heat: 0.7 },
    thinking: { crawl: 1.8, arcs: 6, heat: 0.9 },
    speaking: { crawl: 3.0, arcs: 7, heat: 1.3 },
  },
  fragment: /* glsl */ `
uniform float p_crawl;
uniform float p_arcs;
uniform float p_heat;
uniform vec3 c_arc;
uniform vec3 c_glass;
${COMMON}
void main() {
  vec2 uv = orbUv();
  float radius = 0.84;
  float d = length(uv);
  float glow = 0.0;
  int count = int(floor(p_arcs + 0.5));
  for (int i = 0; i < 8; i++) {
    if (i >= count) break;
    float fi = float(i);
    float ang = fi * 2.399 + sin(p_crawl * 0.7 + fi * 1.9) * 1.2;
    vec2 dir = vec2(cos(ang), sin(ang));
    vec2 perp = vec2(-dir.y, dir.x);
    float t = dot(uv, dir);
    // The filament wanders sideways more the further it is from the core.
    float wander = (fbm(vec2(t * 3.5, fi * 7.1 + p_crawl)) - 0.5) * 0.5 * t;
    float off = abs(dot(uv, perp) - wander);
    float reach = step(0.0, t) * smoothstep(radius, radius * 0.6, t);
    glow += exp(-off * (70.0 - p_heat * 20.0)) * reach;
  }
  float core = exp(-d * d * 30.0) * (0.8 + u_outputVol);
  float shell = pow(smoothstep(radius * 0.7, radius, d), 3.0) * 0.5;
  float inside = discMask(d, radius);
  vec3 col = (c_arc * glow * (0.8 + p_heat) + vec3(1.0) * core + c_glass * shell) * inside;
  float alpha = inside * clamp(0.18 + glow + core + shell, 0.0, 1.0);
  fragColor = vec4(min(col, vec3(1.0)), alpha);
}
`,
};
