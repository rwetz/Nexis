// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Per-run metadata (a note, tags, and a "pinned baseline" flag) stored
 * as `notes.json` inside the run directory — so it travels with the run
 * and is gitignorable/portable like the rest of the run store. Read in
 * the run browser; written via the atomic fs_write_file.
 */
import { invoke } from "@tauri-apps/api/core";
import { currentWorkspaceEnv } from "@/modules/workspace";

export type RunMeta = { note: string; tags: string[]; pinned: boolean };

type ReadResult =
  | { kind: "text"; content: string; size: number }
  | { kind: "binary"; size: number }
  | { kind: "toolarge"; size: number; limit: number };

export function emptyMeta(): RunMeta {
  return { note: "", tags: [], pinned: false };
}

/** Parse notes.json defensively — unknown/garbage fields fall back to
 *  empty rather than throwing into the run browser. */
export function parseRunMeta(raw: unknown): RunMeta {
  if (typeof raw !== "object" || raw === null) return emptyMeta();
  const o = raw as { note?: unknown; tags?: unknown; pinned?: unknown };
  return {
    note: typeof o.note === "string" ? o.note : "",
    tags: Array.isArray(o.tags) ? o.tags.filter((t) => typeof t === "string") : [],
    pinned: o.pinned === true,
  };
}

export async function readRunMeta(dir: string): Promise<RunMeta> {
  try {
    const res = await invoke<ReadResult>("fs_read_file", {
      path: `${dir}/notes.json`,
      workspace: currentWorkspaceEnv(),
    });
    if (res.kind !== "text") return emptyMeta();
    return parseRunMeta(JSON.parse(res.content));
  } catch {
    return emptyMeta();
  }
}

export async function writeRunMeta(dir: string, meta: RunMeta): Promise<void> {
  await invoke("fs_write_file", {
    path: `${dir}/notes.json`,
    content: `${JSON.stringify(meta, null, 2)}\n`,
    workspace: currentWorkspaceEnv(),
    source: "ml-lab",
  });
}
