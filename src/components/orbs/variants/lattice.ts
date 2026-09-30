// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Original Nexis shader. The idea is from shadcn labs' orb list ("Lattice": a crystal folded out of space, tumbling);
// the code is written from scratch, not derived from their non-commercial
// shaders.
import type { OrbVariant } from "../types";
import { COMMON } from "./glsl";

export const lattice: OrbVariant = {
  key: "lattice",
  label: "Lattice",
  note: "A glowing crystal lattice tumbling inside the ball.",
  themed: false,
  params: [
    { key: "tumble", label: "Tumble", min: 0, max: 3, default: 0.35, integrate: true },
    { key: "cells", label: "Cells", min: 1.5, max: 5, default: 2.5 },
    { key: "glow", label: "Glow", min: 0.3, max: 2, default: 1.0 },
  ],
  colors: [
    { key: "edge", label: "Edges", default: "#5fd0ff" },
    { key: "node", label: "Nodes", default: "#ffc94d" },
  ],
  statePresets: {
    idle: { tumble: 0.35, cells: 2.5, glow: 1.0 },
    thinking: { tumble: 1.0, cells: 3.2, glow: 1.2 },
    speaking: { tumble: 1.8, cells: 2.8, glow: 1.6 },
  },
  fragment: /* glsl */ `
uniform float p_tumble;
uniform float p_cells;
uniform float p_glow;
uniform vec3 c_edge;
uniform vec3 c_node;
${COMMON}
void main() {
  vec2 uv = orbUv();
  float radius = 0.84;
  float d = length(uv);
  vec3 col = vec3(0.0);
  float a = 0.0;
  float depth = sqrt(max(0.0, radius * radius - d * d));
  // March straight through the ball, adding light from the lattice edges and
  // nodes along the way; eight samples is plenty at orb sizes.
  for (int i = 0; i < 8; i++) {
    float t = (float(i) + 0.5) / 8.0 * 2.0 - 1.0;
    vec3 pos = turn(vec3(uv, t * depth), p_tumble, p_tumble * 0.7);
    vec3 g = abs(fract(pos * p_cells) - 0.5);
    // Distance to the nearest edge: the length of the two smallest components.
    float e = min(length(g.xy), min(length(g.yz), length(g.xz)));
    float edge = exp(-e * 22.0) * 0.5;
    float node = exp(-length(g) * 18.0) * 1.1;
    col += (c_edge * edge + c_node * node) * p_glow;
    a += (edge + node) * p_glow;
  }
  float inside = discMask(d, radius);
  float rim = pow(smoothstep(radius * 0.75, radius, d), 4.0) * 0.4;
  // A deep, nearly opaque body: the lattice is light, and it only glows
  // against something dark, whatever the theme behind it.
  vec3 body = vec3(0.02, 0.04, 0.09);
  float alpha = inside * clamp(0.88 + a * 0.3 + rim, 0.0, 1.0);
  col = (body * alpha + col * 0.6 + c_edge * rim) * inside;
  fragColor = vec4(min(col, vec3(1.0)), alpha);
}
`,
};
