// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Pre-edit checkpoints for agent file mutations.
 *
 * Taking a snapshot before the agent writes turns the scariest part of an
 * agentic terminal — "it just rewrote a file and I don't know what it
 * changed" — into a reversible operation, using nothing but local git.
 *
 * The governing rule here is **a checkpoint must never block an edit**.
 * Checkpointing is a safety net, not a precondition: no repo, no git, a
 * detached worktree, a permissions problem — every one of those is a reason
 * to proceed without a checkpoint, not a reason to fail the user's request.
 * Every failure path in this module therefore resolves to `null`.
 */

import { native } from "./native";
import type { ToolContext } from "../tools/context";

/**
 * Snapshot the workspace before a mutating tool runs.
 *
 * Returns the checkpoint ref, or `null` when none was taken — which is the
 * common case, not an error: a clean tree has nothing to snapshot, and a
 * directory that isn't a git repo can't have one.
 */
export async function checkpointBeforeEdit(
  ctx: ToolContext,
  label: string,
): Promise<string | null> {
  const root = ctx.getWorkspaceRoot();
  if (!root) return null;
  try {
    const checkpoint = await native.gitCheckpointCreate(root, label);
    return checkpoint?.refName ?? null;
  } catch {
    // Not a repo, git missing, or the snapshot failed. Proceed unprotected
    // rather than refusing the edit — see the module note above.
    return null;
  }
}
