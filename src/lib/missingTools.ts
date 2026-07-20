// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Which external tools have been observed missing this session.
 *
 * Reported lazily, at the moment something actually tried to use a tool and
 * failed — not by probing PATH at startup. Probing would mean spawning a
 * dozen processes on every launch to answer a question most users never ask,
 * and would report `gopls` missing to someone who has never opened a Go file.
 * Reporting on use means the notice appears exactly when it is relevant.
 */

import { create } from "zustand";
import { toolById, type ExternalTool } from "./externalTools";

type MissingToolsState = {
  /** Tool ids observed missing, insertion-ordered. */
  missing: string[];
  /** Ids the user dismissed; suppressed for the rest of the session. */
  dismissed: string[];
  reportMissing: (id: string) => void;
  clearMissing: (id: string) => void;
  dismiss: (id: string) => void;
};

export const useMissingTools = create<MissingToolsState>((set, get) => ({
  missing: [],
  dismissed: [],

  reportMissing(id) {
    // Unknown ids are dropped rather than shown: the UI can only render a
    // tool the matrix describes, and a bare binary name with no install hint
    // is worse than saying nothing.
    if (!toolById(id)) return;
    if (get().missing.includes(id)) return;
    set((s) => ({ missing: [...s.missing, id] }));
  },

  clearMissing(id) {
    if (!get().missing.includes(id)) return;
    set((s) => ({ missing: s.missing.filter((x) => x !== id) }));
  },

  dismiss(id) {
    if (get().dismissed.includes(id)) return;
    set((s) => ({ dismissed: [...s.dismissed, id] }));
  },
}));

/**
 * The tools to actually show: reported missing, not dismissed, and known to
 * the matrix. Derived OUTSIDE the store so callers can use it in a render
 * body — a selector returning this array would allocate a new reference on
 * every call and spin `useSyncExternalStore` (CLAUDE.md pitfall #14).
 */
export function visibleMissingTools(
  missing: readonly string[],
  dismissed: readonly string[],
): ExternalTool[] {
  return missing
    .filter((id) => !dismissed.includes(id))
    .map(toolById)
    .filter((t): t is ExternalTool => t !== null);
}

/** Convenience for non-React callers (the LSP client, formatters, git). */
export function reportMissingTool(id: string): void {
  useMissingTools.getState().reportMissing(id);
}

/** Call when a tool that was reported missing turns out to work. */
export function clearMissingTool(id: string): void {
  useMissingTools.getState().clearMissing(id);
}

/**
 * Match the Rust side's git-unavailable message (`GitError::NotInstalled` in
 * `git/errors.rs`).
 *
 * Sniffing the message is unlovely, but git errors cross IPC as plain strings
 * and every git command can be the one that discovers git is missing —
 * threading a typed error through all 25 of them to reach one status pill is
 * a much larger change for the same result. Kept narrow and in one place so
 * there is a single thing to update if that message changes; a miss degrades
 * to today's behavior (the error still surfaces in the panel), not a crash.
 */
export function noteGitErrorIfMissing(message: string): void {
  if (/git is not available on PATH/i.test(message)) {
    reportMissingTool("git");
  }
}
