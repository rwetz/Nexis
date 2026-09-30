// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Per-frame easing for an orb, with no GPU in sight.
 *
 * Ported from shadercn's `createOrbScene` (renderer.ts; MIT, Copyright (c)
 * 2026 Shadcn Labs): a semi-implicit spring per param and colour channel,
 * synthesized input/output "volumes" per state, and one shared flow clock that
 * runs faster when the orb is "speaking". Switching state only retargets the
 * springs, so a transition is always continuous.
 *
 * The output is a plain uniform map, which is the whole seam to WebGL and the
 * reason this is testable without a context.
 */
import type { OrbState, OrbUniforms, OrbVariant } from "./types";

const PARAM_EASE = 4;
const VOLUME_EASE = 12;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Where a state's synthesized [input, output] volumes sit at `t` seconds. */
export function targetVolumes(state: OrbState, t: number): [number, number] {
  if (state === "speaking") {
    return [clamp01(0.65 + Math.sin(t * 4.8) * 0.22), clamp01(0.75 + Math.sin(t * 3.6) * 0.22)];
  }
  if (state === "thinking") {
    const base = 0.38 + 0.07 * Math.sin(t * 0.7);
    const wander = 0.05 * Math.sin(t * 2.1) * Math.sin(t * 0.37 + 1.2);
    return [clamp01(base + wander), clamp01(0.48 + 0.12 * Math.sin(t * 1.05 + 0.6))];
  }
  return [0, 0.3];
}

/** One semi-implicit (unconditionally stable) critically-damped spring step. */
export function springStep(x: number, v: number, target: number, dt: number): [number, number] {
  const f = 1 + 2 * dt * PARAM_EASE;
  const hoo = dt * PARAM_EASE * PARAM_EASE;
  const hhoo = dt * hoo;
  const detInv = 1 / (f + hhoo);
  return [(f * x + dt * v + hhoo * target) * detInv, (v + hoo * (target - x)) * detInv];
}

/** `#rgb` / `#rrggbb` to 0..1 floats; anything else is white. */
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = Number.parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) return [1, 1, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export type DriveInput = {
  state: OrbState;
  /** Explicit values win over the state's preset and the default. */
  params?: Partial<Record<string, number>>;
  /**
   * The variant's colours as `#rrggbb`, with `theme:` references already
   * resolved by the caller. A state's own colour (`stateColors`) wins.
   */
  baseColors?: Partial<Record<string, string>>;
};

export type OrbDrive = {
  /** Step `dt` seconds toward `input` and return the frame's uniforms. */
  advance(dt: number, input: DriveInput): OrbUniforms;
  setResolution(width: number, height: number): void;
};

/**
 * `seed` offsets the clocks so two orbs of the same variant never animate in
 * lockstep. Tests pass a fixed one.
 */
export function createOrbDrive(variant: OrbVariant, seed = Math.random() * 100): OrbDrive {
  const params = variant.params.map((def) => ({
    def,
    value: def.default,
    velocity: 0,
    clock: seed * (1 + variant.params.indexOf(def) * 0.37),
  }));
  const colors = variant.colors.map((def) => ({
    def,
    value: hexToRgb(def.default.startsWith("#") ? def.default : "#ffffff"),
    velocity: [0, 0, 0] as [number, number, number],
    seeded: false,
  }));

  let seconds = 0;
  let anim = seed;
  let speed = 0.1;
  let speedVelocity = 0;
  const volume = { input: 0, output: 0.3 };
  const res: [number, number] = [1, 1];
  const out: OrbUniforms = {};

  return {
    setResolution(width, height) {
      res[0] = width;
      res[1] = height;
    },
    advance(dt, input) {
      seconds += dt;

      const [inTarget, outTarget] = targetVolumes(input.state, seconds);
      const kVol = 1 - Math.exp(-dt * VOLUME_EASE);
      volume.input += (inTarget - volume.input) * kVol;
      volume.output += (outTarget - volume.output) * kVol;

      // Loud output runs the flow clock faster.
      [speed, speedVelocity] = springStep(speed, speedVelocity, 0.1 + (1 - (volume.output - 1) ** 2) * 0.9, dt);
      anim += dt * speed;

      const preset = variant.statePresets[input.state];
      for (const p of params) {
        const def = p.def;
        const explicit = input.params?.[def.key];
        // A variant's [min, max] is what its shader is written against (a
        // param can be a divisor or a smoothstep edge), so it binds presets
        // and caller values alike, not only a slider.
        const target = Math.min(
          def.max,
          Math.max(def.min, typeof explicit === "number" ? explicit : (preset?.[def.key] ?? def.default)),
        );
        [p.value, p.velocity] = springStep(p.value, p.velocity, target, dt);
        if (def.integrate) {
          p.clock += dt * speed * p.value;
          out[`p_${def.key}`] = p.clock;
        } else {
          out[`p_${def.key}`] = p.value;
        }
      }

      const stateColors = variant.stateColors?.[input.state];
      for (const c of colors) {
        const key = c.def.key;
        const hex = stateColors?.[key] ?? input.baseColors?.[key];
        const target = hex ? hexToRgb(hex) : c.value;
        if (!c.seeded) {
          // The first resolved colour is where the orb starts, not somewhere
          // it fades to from white.
          c.value = target;
          c.seeded = true;
        }
        const next: [number, number, number] = [0, 0, 0];
        for (let i = 0; i < 3; i++) {
          [next[i], c.velocity[i]] = springStep(c.value[i], c.velocity[i], target[i], dt);
        }
        c.value = next;
        out[`c_${key}`] = [next[0], next[1], next[2]];
      }

      out.u_time = seconds * 0.5;
      out.u_anim = anim;
      out.u_inputVol = volume.input;
      out.u_outputVol = volume.output;
      out.u_res = [res[0], res[1]];
      return out;
    },
  };
}
