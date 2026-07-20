// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Plugin-contributed agent tools — the runtime half of the custom AI tool
 * authoring SDK.
 *
 * A contributed tool runs inside the agent loop with the same reach as a
 * built-in, so admission is deliberately strict and happens here, in one
 * pure function, rather than at each registration site:
 *
 *  - **A contribution can never shadow a built-in.** `read_file` and friends
 *    are the model's trusted primitives and their behavior is what the
 *    security guard reasons about; letting a plugin re-bind one of those
 *    names would silently replace a guarded tool with an unguarded one.
 *  - **Names are validated, not trusted.** The name crosses into a provider's
 *    function-calling schema, where most providers accept only
 *    `[a-zA-Z0-9_-]`. An invalid name fails the request as a whole, so one
 *    bad plugin would break every turn rather than just its own tool.
 *  - **First registration wins on a duplicate**, and later ones are dropped
 *    rather than merged — silently overriding an already-admitted tool is the
 *    same shadowing problem one level down.
 *
 * Rejections are logged and skipped, never thrown: a malformed contribution
 * must not take down the agent loop for the tools that are fine.
 */

import { tool, type Tool } from "ai";
import type { z } from "zod";
import type { ToolContext } from "./context";

/**
 * Tool names a contribution may not claim. Kept as data rather than derived
 * from `buildTools()` to avoid an import cycle (tools.ts imports this
 * module); the `plugin_tools_cover_all_builtins` test asserts the two stay in
 * sync, so adding a built-in without listing it here fails the build.
 */
export const RESERVED_TOOL_NAMES: readonly string[] = [
  // fs
  "read_file",
  "list_directory",
  "create_directory",
  "write_file",
  // edit
  "edit",
  "multi_edit",
  // search
  "grep",
  "glob",
  // shell
  "bash_run",
  "bash_background",
  "bash_logs",
  "bash_kill",
  "bash_list",
  // subagent
  "run_subagent",
  // terminal
  "get_terminal_output",
  "suggest_command",
  "open_preview",
  // todo
  "todo_write",
];

/** Providers accept a narrow charset for function names; enforce it early. */
const VALID_TOOL_NAME = /^[a-z][a-z0-9_]{2,47}$/;

export type ToolApproval = "ask" | "auto";

/**
 * A tool contributed by a plugin.
 *
 * `execute` receives the same `ToolContext` the built-ins get, so a
 * contributed tool can resolve paths against the active terminal cwd and read
 * the workspace root without re-deriving them.
 */
export type ToolContribution = {
  /** Registry id, unique per plugin. Convention: `plugin-id:tool-name`. */
  id: string;
  /** The name the model calls. Must be snake_case and not a built-in. */
  name: string;
  /** Shown to the model. Say what it does AND when to use it. */
  description: string;
  inputSchema: z.ZodType;
  execute: (input: never, ctx: ToolContext) => Promise<unknown> | unknown;
  /**
   * Whether the tool runs without asking. Defaults to `"ask"` — a contributed
   * tool is unreviewed third-party code, so the safe default is the one that
   * puts a human in the loop. Set `"auto"` only for genuinely read-only work.
   */
  approval?: ToolApproval;
};

export type ToolAdmission =
  | { ok: true }
  | { ok: false; reason: string };

/** Whether a contribution may be admitted, given the names already taken. */
export function admitTool(
  contribution: ToolContribution,
  takenNames: ReadonlySet<string>,
): ToolAdmission {
  const { name } = contribution;
  if (!VALID_TOOL_NAME.test(name)) {
    return {
      ok: false,
      reason:
        `invalid tool name "${name}" — must be 3-48 chars, lowercase ` +
        "snake_case, starting with a letter",
    };
  }
  if (RESERVED_TOOL_NAMES.includes(name)) {
    return {
      ok: false,
      reason: `"${name}" is a built-in tool name and cannot be overridden`,
    };
  }
  if (takenNames.has(name)) {
    return { ok: false, reason: `duplicate tool name "${name}" already registered` };
  }
  if (typeof contribution.execute !== "function") {
    return { ok: false, reason: `tool "${name}" has no execute function` };
  }
  if (!contribution.description?.trim()) {
    return {
      ok: false,
      reason: `tool "${name}" needs a description — the model cannot use an unlabelled tool`,
    };
  }
  return { ok: true };
}

/**
 * Convert admitted contributions into AI SDK tools, keyed by tool name.
 *
 * `onReject` reports why a contribution was dropped; the default logs. It's a
 * parameter so tests can assert rejections without spying on the console.
 */
export function buildPluginTools(
  contributions: readonly ToolContribution[],
  ctx: ToolContext,
  onReject: (contribution: ToolContribution, reason: string) => void = (c, r) =>
    console.warn(`[nexis] plugin tool "${c.id}" rejected: ${r}`),
): Record<string, Tool<never, unknown>> {
  const out: Record<string, Tool<never, unknown>> = {};
  const taken = new Set<string>();

  for (const c of contributions) {
    const verdict = admitTool(c, taken);
    if (!verdict.ok) {
      onReject(c, verdict.reason);
      continue;
    }
    taken.add(c.name);
    out[c.name] = tool({
      description: c.description,
      inputSchema: c.inputSchema as never,
      // Same approval mechanism the mutating built-ins use (`write_file`,
      // `edit`, `bash_run`): the SDK surfaces a `tool-approval-request` part
      // that the UI renders as a confirmation card, and only runs `execute`
      // once the user accepts. Defaulting to true is the point — a
      // contributed tool is unreviewed third-party code.
      needsApproval: c.approval !== "auto",
      execute: async (input: never) => {
        try {
          return await c.execute(input, ctx);
        } catch (e) {
          // A throwing tool must come back as a result the model can read and
          // recover from, not an exception that aborts the whole turn.
          return { error: e instanceof Error ? e.message : String(e) };
        }
      },
    });
  }
  return out;
}
