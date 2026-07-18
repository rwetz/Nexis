// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Bridge for the editor autosave / crash-recovery IPC family. Dirty buffers
// snapshot here (debounced) so a crash or kill never loses more than a few
// seconds of typing; useDocument offers the snapshot back on next open.

import { invoke } from "@tauri-apps/api/core";

/** Quiet period after the last keystroke before a dirty buffer snapshots. */
export const AUTOSAVE_DEBOUNCE_MS = 2000;

/** Recovery files older than this are swept on first editor use per launch. */
const SWEEP_MAX_AGE_SECS = 7 * 24 * 3600;

export async function writeEditorAutosave(
  path: string,
  content: string,
): Promise<void> {
  return invoke("editor_autosave_write", { path, content });
}

export async function readEditorAutosave(
  path: string,
): Promise<string | null> {
  return invoke<string | null>("editor_autosave_read", { path });
}

export async function deleteEditorAutosave(path: string): Promise<void> {
  return invoke("editor_autosave_delete", { path });
}

let sweepStarted = false;
/** Age-sweep abandoned recovery files, once per app launch, piggybacked on
 * the first document load so no window-level init hook is needed. */
export function sweepEditorAutosavesOnce(): void {
  if (sweepStarted) return;
  sweepStarted = true;
  void invoke("editor_autosave_sweep", {
    maxAgeSecs: SWEEP_MAX_AGE_SECS,
  }).catch(() => {});
}
