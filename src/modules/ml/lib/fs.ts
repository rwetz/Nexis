// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Shared file-read helper for the ML module. Several run-store files
 * (train.toml, notes.json, confusion matrices, metrics.jsonl) are read the
 * same way — fs_read_file → text or null — so they go through one place
 * instead of re-declaring the ReadResult union and the read-and-guard
 * dance in every lib.
 */
import { filesystem } from "@/platform/filesystem";


/** Read a workspace file's text, or null if it's missing, binary, too
 *  large, or unreadable. Callers that need to distinguish those cases
 *  (e.g. a "too large" message) should invoke `fs_read_file` directly. */
export async function readTextFile(path: string): Promise<string | null> {
  try {
    const res = await filesystem.readFile(path);
    return res.kind === "text" ? res.content : null;
  } catch {
    return null;
  }
}
