// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Original Nexis shader. The idea is from shadcn labs' orb list ("Vectors": field lines swirling about a wandering axis);
// the code is written from scratch, not derived from their non-commercial
// shaders.
import type { OrbVariant } from "../types";
import { COMMON } from "./glsl";

export const field: OrbVariant = {
  key: "field",
  label: "Field",
  note: "Dipole field lines looping around an axis that slowly wanders.",
  themed: true,
  params: [
    { key: "flow", label: "Flow", min: 0, max: 4, default: 0.5, integrate: true },
    { key: "lines", label: "Lines", min: 4, max: 20, default: 10 },
    { key: "wander", label: "Wander", min: 0, max: 1.5, default: 0.5 },
  ],
  colors: [
    { key: "line", label: "Lines", default: "theme:--brand|#f0765a" },
    { key: "pole", label: "Poles", default: "theme:--terminal-ansi-blue|#5b8def" },
  ],
  statePresets: {
    idle: { flow: 0.5, lines: 10, wander: 0.5 },
    thinking: { flow: 1.4, lines: 14, wander: 0.8 },
    speaking: { flow: 2.4, lines: 11, wander: 1.2 },
  },
  fragment: /* glsl */ `
uniform float p_flow;
uniform float p_lines;
uniform float p_wander;
uniform vec3 c_line;
uniform vec3 c_pole;
${COMMON}
void main() {
  vec2 uv = orbUv();
  float radius = 0.84;
  float d = length(uv);
  float ang = sin(p_flow * 0.4) * p_wander + 1.5708;
  vec2 axis = vec2(cos(ang), sin(ang));
  vec2 p = uv / radius;
  float r = max(length(p), 0.04);
  // A 2D dipole: field lines are level sets of sin^2(theta) / r, with theta
  // measured from the axis.
  float s = (p.x * axis.y - p.y * axis.x) / r;
  float psi = s * s / r;
  float stream = fract(psi * p_lines * 0.25 - p_flow * 0.5);
  // Thin lines at each level: distance to the nearest whole value of stream.
  float line = smoothstep(0.09, 0.0, min(stream, 1.0 - stream));
  float poles = exp(-pow(abs(dot(p, axis)) - 0.15, 2.0) * 40.0) * exp(-dot(p, p) * 4.0);
  vec3 col = c_line * line * 0.9 + c_pole * poles;
  float inside = discMask(d, radius);
  float alpha = inside * clamp(0.12 + line * 0.85 + poles, 0.0, 1.0);
  fragColor = vec4(min(col, vec3(1.0)) * inside, alpha);
}
`,
};
