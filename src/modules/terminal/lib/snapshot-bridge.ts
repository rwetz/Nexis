// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Bridge for the session-snapshot IPC family ("restore scrollback on
// relaunch"). Files live under ~/.cache/nexis/session-snapshots/, keyed by
// the stable snapshot id each terminal tab carries in its persisted state.

import { defineCommand } from "@/platform/ipc";
import { hostIpc } from "@/platform/tauri";

const saveSnapshot = defineCommand<{ id: string; data: string }, void>("session_snapshot_save", "host");
const loadSnapshot = defineCommand<{ id: string }, string | null>("session_snapshot_load", "host");
const deleteSnapshot = defineCommand<{ id: string }, void>("session_snapshot_delete", "host");
const gcSnapshots = defineCommand<{ keep: string[] }, void>("session_snapshot_gc", "host");

/**
 * Replay cap, in UTF-16 units. Serialized scrollback beyond this is trimmed
 * from the front before saving so a restore never replays more than the PTY
 * pending-buffer cap (4 MiB) worth of bytes into a fresh terminal.
 */
export const MAX_SNAPSHOT_CHARS = 4 * 1024 * 1024;

export async function saveSessionSnapshot(
  id: string,
  data: string,
): Promise<void> {
  const trimmed =
    data.length > MAX_SNAPSHOT_CHARS ? data.slice(-MAX_SNAPSHOT_CHARS) : data;
  return hostIpc.call(saveSnapshot, { id, data: trimmed });
}

export async function loadSessionSnapshot(id: string): Promise<string | null> {
  return hostIpc.call(loadSnapshot, { id });
}

export async function deleteSessionSnapshot(id: string): Promise<void> {
  return hostIpc.call(deleteSnapshot, { id });
}

/** Delete every snapshot file whose id is not in `keep`. */
export async function gcSessionSnapshots(keep: string[]): Promise<void> {
  return hostIpc.call(gcSnapshots, { keep });
}
