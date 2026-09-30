// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import type { OrbVariant } from "../types";
import { caustic } from "./caustic";
import { chromatic } from "./chromatic";
import { dither } from "./dither";
import { eclipse } from "./eclipse";
import { falls } from "./falls";
import { field } from "./field";
import { galaxy } from "./galaxy";
import { glass } from "./glass";
import { ion } from "./ion";
import { iridescent } from "./iridescent";
import { lattice } from "./lattice";
import { moire } from "./moire";
import { nacre } from "./nacre";
import { nebula } from "./nebula";
import { nimbus } from "./nimbus";
import { orbital } from "./orbital";
import { phosphor } from "./phosphor";
import { plasma } from "./plasma";
import { rings } from "./rings";
import { scroll } from "./scroll";
import { spectra } from "./spectra";
import { swarm } from "./swarm";
import { torsion } from "./torsion";
import { tracks } from "./tracks";
import { voxel } from "./voxel";
import { weave } from "./weave";

/** Gallery order. The first is the default. */
export const ORB_VARIANTS: readonly OrbVariant[] = [
  glass, plasma, nebula, rings, swarm, dither, iridescent, scroll,
  galaxy, torsion, caustic, moire, ion, weave, nacre, field,
  phosphor, voxel, eclipse, chromatic, spectra, orbital, tracks, lattice, falls, nimbus,
];

export const ORB_IDS = ORB_VARIANTS.map((v) => v.key);

export function orbVariant(id: string): OrbVariant | undefined {
  return ORB_VARIANTS.find((v) => v.key === id);
}
