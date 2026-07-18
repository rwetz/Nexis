// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Append-only audit trail of agent shell activity, written to
// {data}/nexis/ai-command-audit.log via the ai_audit_append command.
// Fire-and-forget by design: auditing must never break, slow, or reorder a
// tool call, and a lost line (app killed mid-write) is acceptable where a
// blocked agent is not.

import { invoke } from "@tauri-apps/api/core";

export type AuditEntry = {
  kind: "run" | "background" | "kill" | "blocked";
  command?: string;
  cwd?: string | null;
  exit_code?: number | null;
  timed_out?: boolean;
  handle?: number;
  reason?: string;
  session?: string;
  /** How the approval gate was passed: an explicit user click, the blanket
   * per-tool "auto" policy, or the scoped read-only "auto-safe" policy. */
  approval?: "user" | "auto" | "auto-safe";
};

/** Best-effort, non-throwing append. Safe to call from any tool path. */
export function auditAgentCommand(entry: AuditEntry): void {
  try {
    void invoke("ai_audit_append", { entry }).catch(() => {});
  } catch {
    // invoke itself can throw outside a Tauri webview (tests) — ignore.
  }
}
