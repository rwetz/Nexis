// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * GLSL shared by the orb variants: hashing, value noise, fbm, the orb's
 * coordinate frame and its antialiased edge. Standard textbook forms, written
 * for Nexis; no shader here is derived from shadercn's (non-commercial) orbs.
 *
 * Every variant draws inside the unit disc of `orbUv()` and writes
 * premultiplied colour, so the canvas composites cleanly over any theme.
 */
export const COMMON = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  mat2 rot = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) {
    sum += amp * vnoise(p);
    p = rot * p;
    amp *= 0.5;
  }
  return sum;
}

mat2 rot2(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

// -1..1 across the shorter side, y up.
vec2 orbUv() {
  return (gl_FragCoord.xy * 2.0 - u_res) / min(u_res.x, u_res.y);
}

// One device pixel in orbUv units, for antialiased edges at any size.
float orbPx() {
  return 2.0 / min(u_res.x, u_res.y);
}

// A smooth rainbow for 0..1 (a cosine palette), for orbs whose look is
// iridescence or dispersion rather than the theme's two colours.
vec3 spectrum(float t) {
  return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
}

// The front of a unit sphere seen at p (orb disc coordinates, radius 1):
// the surface point, which doubles as its normal. z is 0 off the sphere.
vec3 spherePoint(vec2 p) {
  return vec3(p, sqrt(max(0.0, 1.0 - dot(p, p))));
}

// Turn a point about Y by ay, then about X by ax.
vec3 turn(vec3 v, float ay, float ax) {
  v.xz = rot2(ay) * v.xz;
  v.yz = rot2(ax) * v.yz;
  return v;
}

// Diffuse light from the upper left, the house light for sphere orbs.
float lambert(vec3 n) {
  return clamp(dot(n, normalize(vec3(-0.45, 0.55, 0.7))), 0.0, 1.0);
}

// 1 inside a disc of radius r, 0 outside, with a one-pixel antialiased edge.
float discMask(float dist, float r) {
  float px = orbPx();
  return 1.0 - smoothstep(r - px, r + px, dist);
}
`;
