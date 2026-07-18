// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Tiny leafId → snapshotId registry connecting tab restore to the terminal
// session layer. Kept dependency-free so tabPersistence can register pending
// restores without pulling the whole terminal stack (xterm, PTY bridge) into
// its import graph — which would break its pure-function tests.

const pending = new Map<number, string>();

/**
 * Mark a freshly restored terminal leaf as having a scrollback snapshot to
 * replay. Idempotent — tab restore runs its builder more than once with
 * deterministic ids, so re-registering the same pair is harmless.
 */
export function registerPendingSessionRestore(
  leafId: number,
  snapshotId: string,
): void {
  pending.set(leafId, snapshotId);
}

/** Consume the pending snapshot id for a leaf, if any. */
export function takePendingSessionRestore(leafId: number): string | null {
  const id = pending.get(leafId) ?? null;
  pending.delete(leafId);
  return id;
}
