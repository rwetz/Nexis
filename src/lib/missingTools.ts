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

import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { toolById, type ExternalTool } from "./externalTools";

/**
 * The workspace to re-check `runsIn: "workspace"` tools in.
 *
 * Structurally identical to `WorkspaceEnv` in `modules/workspace/env`, but
 * declared here rather than imported: this module is loaded by the LSP client
 * and by git error handling, and pulling the workspace store (and through it
 * the settings store, and through that the Tauri store plugin) into that graph
 * to name one type is a poor trade. The caller passes the value in.
 */
export type ProbeWorkspace = { kind: "local" } | { kind: "wsl"; distro: string };

/** What a refresh did, for the UI to report. */
export type RefreshResult = {
  /** Tool ids that resolved this time and have been retired from the list. */
  cleared: string[];
  /** IPC failure, if the check could not run at all. */
  error: string | null;
};

type MissingToolsState = {
  /** Tool ids observed missing, insertion-ordered. */
  missing: string[];
  /** Ids the user dismissed; suppressed for the rest of the session. */
  dismissed: string[];
  /** A re-check is in flight; the UI disables the button and spins it. */
  refreshing: boolean;
  reportMissing: (id: string) => void;
  clearMissing: (id: string) => void;
  dismiss: (id: string) => void;
  refresh: (workspace: ProbeWorkspace) => Promise<RefreshResult>;
};

export const useMissingTools = create<MissingToolsState>((set, get) => ({
  missing: [],
  dismissed: [],
  refreshing: false,

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

  /**
   * Re-check every listed tool and retire the ones that now resolve.
   *
   * The list is raised lazily, by whatever tried to use a tool and failed,
   * which is the right trigger for showing it and a bad one for hiding it: a
   * user who runs the install command we handed them has nothing left to
   * trigger a recheck, so the notice outlived its cause and read as broken.
   * This is the deliberate recheck. It never *adds* entries — a tool that is
   * still missing has already said so, and a refresh that grew the list would
   * punish pressing the button.
   */
  async refresh(workspace) {
    if (get().refreshing) return { cleared: [], error: null };
    set({ refreshing: true });
    try {
      const tools = visibleMissingTools(get().missing, get().dismissed);
      // Two probes at most, not one per tool: `runsIn` splits the list by the
      // machine each tool is actually spawned on, and everything on a side
      // shares one round trip.
      const groups: [ProbeWorkspace, ExternalTool[]][] = [
        [{ kind: "local" }, tools.filter((t) => t.runsIn === "host")],
        [workspace, tools.filter((t) => t.runsIn === "workspace")],
      ];
      const results = await Promise.all(
        groups.map(([env, group]) => probeTools(group, env)),
      );
      const cleared = results.flatMap((r) => r.found);
      const error = results.map((r) => r.error).find((e) => e !== null) ?? null;
      if (cleared.length > 0) {
        const retired = new Set(cleared);
        set((s) => ({ missing: s.missing.filter((id) => !retired.has(id)) }));
      }
      return { cleared, error };
    } finally {
      set({ refreshing: false });
    }
  },
}));

/** One `tool_probe` round trip for the tools that share an environment. */
async function probeTools(
  tools: readonly ExternalTool[],
  workspace: ProbeWorkspace,
): Promise<{ found: string[]; error: string | null }> {
  if (tools.length === 0) return { found: [], error: null };
  try {
    const found = await invoke<string[]>("tool_probe", {
      binaries: tools.map((t) => t.binary),
      workspace,
    });
    const resolved = new Set(found);
    return {
      found: tools.filter((t) => resolved.has(t.binary)).map((t) => t.id),
      error: null,
    };
  } catch (e) {
    // Reported rather than swallowed: silently answering "still not found"
    // when the check never ran is the same class of lie the notice exists to
    // end.
    return { found: [], error: String(e) };
  }
}

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
  const hidden = new Set(dismissed);
  const out: ExternalTool[] = [];
  for (const id of missing) {
    if (hidden.has(id)) continue;
    const tool = toolById(id);
    if (tool) out.push(tool);
  }
  return out;
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
