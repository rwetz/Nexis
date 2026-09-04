// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The command ledger's writer — the frontend half.
 *
 * Implements the decision record at `docs/vault/decisions/command-ledger.md`.
 * Two of its rules are enforced here rather than in Rust, and both are load
 * bearing enough to have tripwires in `src/lib/pitfall-guards.test.ts`:
 *
 * ## 1. Redaction happens here, before IPC
 *
 * `redactSensitive()` is TypeScript and has no Rust counterpart. Porting the
 * pattern list would mean two copies of a security-critical regex set, which
 * is how they drift — so the ledger follows the precedent the share server and
 * the diagnostics bundle already set: the frontend redacts, then calls the
 * command. A command line is *precisely* where an API key ends up, and this
 * store is durable by design.
 *
 * Redaction applies to `argv` **and** to the output blob. Both.
 *
 * ## 2. Private terminals never enter the ledger
 *
 * `TerminalTab.private` already means "the AI agent cannot read this buffer",
 * and a private tab already never gets a scrollback snapshot. The ledger holds
 * the identical rule. The *gate* is in the OSC 133 handler, at the source,
 * because a filter applied at write time is a filter someone later moves; this
 * module supplies the fact the gate asks for.
 *
 * A ledger that records private terminals is a silent privacy failure, and
 * silent failures need tripwires rather than review.
 */

import { redactSensitive } from "@/modules/ai/lib/redact";
import { stripVerbatimPrefix } from "@/lib/path";
import { native } from "@/modules/ai/lib/native";

/**
 * Answers "is this leaf inside a private tab?".
 *
 * Injected by App, which owns the tab list — the terminal session knows only
 * its leaf id. A resolver that has not been installed answers *private*, so
 * the failure mode of forgetting to wire it is "records nothing", never
 * "records a private terminal".
 */
type PrivacyResolver = (leafId: number) => boolean;

let isPrivateLeaf: PrivacyResolver = () => true;

export function setLedgerPrivacyResolver(resolver: PrivacyResolver): void {
  isPrivateLeaf = resolver;
}

/** Whether this leaf may be recorded at all. Consulted at the OSC source. */
export function ledgerAllowsLeaf(leafId: number): boolean {
  return !isPrivateLeaf(leafId);
}

/**
 * The workspace the ledger keys on, also injected by App.
 *
 * Null means "no workspace open", and a command outside a workspace is not
 * recorded — there is nothing to file it under, and inventing a bucket would
 * mix unrelated projects.
 */
let workspaceRootSource: () => string | null = () => null;

export function setLedgerWorkspaceSource(source: () => string | null): void {
  workspaceRootSource = source;
}

export function currentLedgerWorkspaceRoot(): string | null {
  return workspaceRootSource();
}

// ── Workspace identity ──────────────────────────────────────────────────────

/**
 * A stable id for a workspace root.
 *
 * Pitfall #23 is explicit that path strings are not stable identity, so the
 * path is normalized through `stripVerbatimPrefix` and slash-flipped first;
 * Windows paths are case-folded because the filesystem is. `workspaceScopeKey`
 * deliberately is *not* used — it returns `local` or `wsl:<distro>`, which is
 * an *environment* key, so everything scoped with it is shared across every
 * local project.
 *
 * FNV-1a rather than a cryptographic hash: this is a directory name, not a
 * secret, and the charset has to survive `validate_id` on the Rust side.
 */
export function workspaceLedgerId(root: string): string {
  const normalized = stripVerbatimPrefix(root)
    .replace(/\\/g, "/")
    .replace(/\/+$/, "")
    .toLowerCase();

  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // A second pass over the reversed string widens the id enough that two
  // ordinary project paths are not going to collide, without pulling in a
  // hashing dependency for a cache directory name.
  let tail = 0x811c9dc5;
  for (let i = normalized.length - 1; i >= 0; i--) {
    tail ^= normalized.charCodeAt(i);
    tail = Math.imul(tail, 0x01000193) >>> 0;
  }
  return `ws-${hash.toString(36)}${tail.toString(36)}`;
}

/** Ids the Rust side will accept: alphanumerics and hyphens, 64 max. */
function mintId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

// ── Records ─────────────────────────────────────────────────────────────────

export type CommandRecord = {
  id: string;
  /** Epoch milliseconds. The Rust prune and time-window forget read this. */
  startedAt: number;
  endedAt: number;
  durationMs: number;
  cwd: string;
  argv: string;
  exitCode: number;
  /** Names a blob under the workspace's `blobs/` directory, when captured. */
  outputId?: string;
};

export type RecordInput = {
  leafId: number;
  workspaceRoot: string | null;
  cwd: string;
  argv: string;
  exitCode: number;
  startedAt: number;
  endedAt: number;
  /** Captured output, or empty to record metadata only. */
  output?: string;
};

/**
 * Write one command to the ledger.
 *
 * Returns the record it wrote, or null when nothing was written — which is the
 * ordinary case for a private terminal or a workspace-less window, not an
 * error. Failures are swallowed on purpose: a ledger that cannot write must
 * never break the terminal it is watching.
 */
export async function recordCommand(
  input: RecordInput,
): Promise<CommandRecord | null> {
  // Belt and braces. The OSC handler already gates on this, but the check is
  // cheap and this function is the one an eighth feature will call directly.
  if (!ledgerAllowsLeaf(input.leafId)) return null;
  if (!input.workspaceRoot) return null;

  const workspaceId = workspaceLedgerId(input.workspaceRoot);
  const argv = redactSensitive(input.argv).trim();
  if (argv === "") return null;

  const record: CommandRecord = {
    id: mintId("cmd"),
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    durationMs: Math.max(0, input.endedAt - input.startedAt),
    cwd: redactSensitive(input.cwd),
    argv,
    exitCode: input.exitCode,
  };

  try {
    const output = input.output ? redactSensitive(input.output) : "";
    if (output.trim() !== "") {
      const outputId = mintId("out");
      await native.ledgerWriteOutput(workspaceId, outputId, output);
      record.outputId = outputId;
    }
    // JSON.stringify emits no raw newlines, which is what keeps one record on
    // one line — the Rust side rejects a multi-line record for exactly that
    // reason, since the reader treats every line as a record.
    await native.ledgerAppend(workspaceId, JSON.stringify(record));
    return record;
  } catch {
    // A ledger that cannot write must not break the terminal it watches.
    return null;
  }
}

// ── Reading, forgetting, pruning ────────────────────────────────────────────
//
// The surfaces below all take a workspace *root* rather than a ledger id, so
// no caller outside this module has to know how identity is derived. Every one
// of them answers null / 0 rather than throwing when there is no workspace
// open: "nothing to do" is the ordinary case here, not an error.

export type LedgerStats = {
  records: number;
  logBytes: number;
  blobCount: number;
  blobBytes: number;
  oldestMs: number | null;
  newestMs: number | null;
};

/** What the ledger holds for a workspace, or null if none is open. */
export async function ledgerStats(
  root: string | null,
): Promise<LedgerStats | null> {
  if (!root) return null;
  try {
    return await native.ledgerStats(workspaceLedgerId(root));
  } catch {
    return null;
  }
}

/**
 * Forget everything recorded at or after `sinceMs`. Returns how many records
 * went, which the caller reports back — a forget gesture that says nothing is
 * indistinguishable from one that silently failed.
 *
 * This is the escape hatch for a redaction miss (decision record §5): the
 * pattern list will eventually miss something, and when it does the user needs
 * one gesture rather than a hunt through their own history.
 */
export async function forgetLedgerSince(
  root: string | null,
  sinceMs: number,
): Promise<number> {
  if (!root) return 0;
  return native.ledgerForgetSince(workspaceLedgerId(root), sinceMs);
}

/** Forget a workspace entirely — log, blobs, directory. */
export async function forgetLedgerWorkspace(
  root: string | null,
): Promise<void> {
  if (!root) return;
  await native.ledgerForgetWorkspace(workspaceLedgerId(root));
}

export type LedgerRetention = {
  maxRecords: number;
  maxAgeDays: number;
  maxOutputMb: number;
};

/**
 * Apply the retention caps for one workspace. Runs on workspace open, which
 * is where §7 puts it — not on a timer and not on every write, so a long
 * session never pays for it and a workspace nobody opens costs nothing.
 *
 * Failures are swallowed for the same reason writes are: retention is
 * housekeeping, and housekeeping must not be able to break opening a folder.
 */
export async function pruneLedger(
  root: string | null,
  retention: LedgerRetention,
): Promise<void> {
  if (!root) return;
  try {
    await native.ledgerPrune({
      workspaceId: workspaceLedgerId(root),
      maxRecords: retention.maxRecords,
      maxAgeDays: retention.maxAgeDays,
      maxBlobBytes: retention.maxOutputMb * 1024 * 1024,
      nowMs: Date.now(),
    });
  } catch {
    // Housekeeping must never break opening a workspace.
  }
}

/** Parse a stored line back into a record, or null if it is not one. */
export function parseRecord(line: string): CommandRecord | null {
  try {
    const parsed: unknown = JSON.parse(line);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as CommandRecord).id === "string" &&
      typeof (parsed as CommandRecord).argv === "string" &&
      typeof (parsed as CommandRecord).startedAt === "number"
    ) {
      return parsed as CommandRecord;
    }
    return null;
  } catch {
    return null;
  }
}
