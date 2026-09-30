// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Orb ids alone, for code on the startup path (the preferences store) that
 * must validate an id without pulling every shader's source into the main
 * chunk. `variants.test.ts` keeps this list equal to `ORB_VARIANTS`.
 */
export const ORB_ID_LIST = [
  "glass",
  "plasma",
  "nebula",
  "rings",
  "swarm",
  "dither",
  "iridescent",
  "scroll",
  "galaxy",
  "torsion",
  "caustic",
  "moire",
  "ion",
  "weave",
  "nacre",
  "field",
  "phosphor",
  "voxel",
  "eclipse",
  "chromatic",
  "spectra",
  "orbital",
  "tracks",
  "lattice",
  "falls",
  "nimbus",
] as const;

export type OrbId = (typeof ORB_ID_LIST)[number];

/** The preference value: an orb, or "off" to keep the plain logo and spinner. */
export type AiOrbPref = OrbId | "off";

export const DEFAULT_AI_ORB: AiOrbPref = "glass";

export function isAiOrbPref(value: unknown): value is AiOrbPref {
  return value === "off" || (ORB_ID_LIST as readonly unknown[]).includes(value);
}
