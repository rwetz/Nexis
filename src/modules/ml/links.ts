// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Following a link into Synapse: select a project and, optionally, open one
 * of its runs. Links come from Pulse (a model's "Open in Synapse") and from
 * Epoch (`nexis://ml-lab?project=...&run=...`), so the path may be spelled
 * with either separator; it is matched against the projects Synapse found.
 */

import { isInside } from "@/modules/window/deepLinks";
import { useMlStore } from "./store";

const same = (a: string, b: string) => isInside(a, b) && isInside(b, a);

/** The store's own spelling of `dir`, if Synapse lists that project. */
export function knownProjectDir(dir: string): string | null {
  return useMlStore.getState().projects.find((p) => same(p.dir, dir))?.dir ?? null;
}

export async function focusMlRun(projectDir: string, runId?: string): Promise<void> {
  const store = useMlStore.getState();
  // The project list loads when the window gets its root; give it a moment.
  let dir = knownProjectDir(projectDir);
  for (let i = 0; !dir && i < 20; i++) {
    await new Promise((r) => setTimeout(r, 150));
    dir = knownProjectDir(projectDir);
  }
  if (!dir) return;
  if (useMlStore.getState().selectedProject !== dir) store.selectProject(dir);
  if (!runId) return;
  await useMlStore.getState().refreshRuns(dir);
  const run = useMlStore.getState().runs.find((r) => r.id === runId);
  if (run) await useMlStore.getState().loadHistoricalRun(run);
}
