// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The orb contract. The shapes follow shadercn's Orbkit renderer
 * (https://github.com/shadcn-labs/shadercn, registry/components/orbs/
 * renderer.ts; MIT, Copyright (c) 2026 Shadcn Labs) so a variant reads the
 * same way here as there. The GPU layer is WebGL2 rather than WebGPU, and
 * every shader is Nexis's own: shadercn's orb shaders are licensed
 * non-commercial only, which Nexis cannot carry. See docs/vault/subsystems/
 * orbs.md.
 */

export type OrbState = "idle" | "thinking" | "speaking";

export const ORB_STATES: readonly OrbState[] = ["idle", "thinking", "speaking"];

export interface OrbParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  default: number;
  /** Integrated as a phase clock instead of eased, for shaders that read an angle or offset. */
  integrate?: boolean;
}

/**
 * A colour is a `#rrggbb` hex, or `theme:<css-var>|#fallback`: the custom
 * property is resolved from the active theme when the orb mounts, so an orb
 * takes the theme the way the rest of the app does, and the fallback covers
 * a theme that does not define that property.
 */
export interface OrbColorDef {
  key: string;
  label: string;
  default: string;
}

export interface OrbVariant {
  key: string;
  label: string;
  note: string;
  /**
   * GLSL ES 3.00 fragment shader body. The renderer prepends the version,
   * precision and the shared uniforms (`u_time`, `u_anim`, `u_inputVol`,
   * `u_outputVol`, `u_res`); the variant declares its own `p_<param>` floats
   * and `c_<colour>` vec3s and writes premultiplied `fragColor`.
   */
  fragment: string;
  params: OrbParamDef[];
  colors: OrbColorDef[];
  statePresets: Partial<Record<OrbState, Record<string, number>>>;
  /** Per-state colour overrides, `#rrggbb` only (never `theme:`). */
  stateColors?: Partial<Record<OrbState, Record<string, string>>>;
}

/** What one frame hands the GPU: every uniform by name. */
export type OrbUniforms = Record<string, number | readonly number[]>;

/** Uniforms the renderer declares for every variant. */
export const SHARED_UNIFORMS = ["u_time", "u_anim", "u_inputVol", "u_outputVol", "u_res"] as const;
