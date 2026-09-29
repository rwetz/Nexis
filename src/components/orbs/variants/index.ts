// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import type { OrbVariant } from "../types";
import { dither } from "./dither";
import { glass } from "./glass";
import { nebula } from "./nebula";
import { plasma } from "./plasma";
import { rings } from "./rings";
import { swarm } from "./swarm";

/** Gallery order. The first is the default. */
export const ORB_VARIANTS: readonly OrbVariant[] = [glass, plasma, nebula, rings, swarm, dither];

export const ORB_IDS = ORB_VARIANTS.map((v) => v.key);

export function orbVariant(id: string): OrbVariant | undefined {
  return ORB_VARIANTS.find((v) => v.key === id);
}
