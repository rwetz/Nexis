// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import type { EpochLink } from "@nexis-epoch/desktop/embed";

/** Launch parameters → a link. An explicit `project` always counts; the
 * workspace `root` the title bar adds only on the open that creates the
 * window, so summoning Epoch again doesn't pull it off the project it is on. */
export function linkFromParams(params: Record<string, string>, first: boolean): EpochLink | null {
  const project = params.project ?? (first ? params.root : undefined);
  if (!project) return null;
  return { project, run: params.run ?? null, dataset: params.dataset ?? null };
}
