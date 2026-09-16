// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Bridge for the editor autosave / crash-recovery IPC family. Dirty buffers
// snapshot here (debounced) so a crash or kill never loses more than a few
// seconds of typing; useDocument offers the snapshot back on next open.

import { defineCommand } from "@/platform/ipc";
import { hostIpc } from "@/platform/tauri";

/** Quiet period after the last keystroke before a dirty buffer snapshots. */
export const AUTOSAVE_DEBOUNCE_MS = 2000;

/** Recovery files older than this are swept on first editor use per launch. */
const SWEEP_MAX_AGE_SECS = 7 * 24 * 3600;
const writeAutosave = defineCommand<{ path: string; content: string }, void>("editor_autosave_write", "host");
const readAutosave = defineCommand<{ path: string }, string | null>("editor_autosave_read", "host");
const deleteAutosave = defineCommand<{ path: string }, void>("editor_autosave_delete", "host");
const sweepAutosaves = defineCommand<{ maxAgeSecs: number }, void>("editor_autosave_sweep", "host");

export async function writeEditorAutosave(
  path: string,
  content: string,
): Promise<void> {
  return hostIpc.call(writeAutosave, { path, content });
}

export async function readEditorAutosave(
  path: string,
): Promise<string | null> {
  return hostIpc.call(readAutosave, { path });
}

export async function deleteEditorAutosave(path: string): Promise<void> {
  return hostIpc.call(deleteAutosave, { path });
}

let sweepStarted = false;
/** Age-sweep abandoned recovery files, once per app launch, piggybacked on
 * the first document load so no window-level init hook is needed. */
export function sweepEditorAutosavesOnce(): void {
  if (sweepStarted) return;
  sweepStarted = true;
  void hostIpc.call(sweepAutosaves, {
    maxAgeSecs: SWEEP_MAX_AGE_SECS,
  }).catch(() => {});
}
