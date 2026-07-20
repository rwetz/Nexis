// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Local test harness for custom agent tools.
 *
 * Authoring a tool without this means booting the whole app to find out that
 * a schema field was misspelled. `runTool` executes a `ToolContribution` the
 * way the agent loop would — same admission rules, same `ToolContext` shape,
 * same input validation — inside a plain Vitest/Node test.
 *
 * It deliberately runs the *real* admission path rather than calling
 * `execute` directly, so a tool that would be rejected at runtime (reserved
 * name, bad description) fails in the author's test rather than silently
 * never appearing in the app.
 */

import type { ToolContext } from "./context";
import { admitTool, type ToolContribution } from "./plugin-tools";

/**
 * A `ToolContext` with inert defaults, overridable per test.
 *
 * Defaults describe a workspace at `/workspace` with no active terminal — the
 * shape a tool is most likely to meet and least likely to be written for, so
 * a tool that assumes a cwd fails loudly here instead of in production.
 */
export function createTestToolContext(
  overrides: Partial<ToolContext> = {},
): ToolContext {
  return {
    getCwd: () => "/workspace",
    getWorkspaceRoot: () => "/workspace",
    getTerminalContext: () => null,
    isActiveTerminalPrivate: () => false,
    injectIntoActivePty: () => false,
    openPreview: () => false,
    readCache: new Map(),
    getSessionId: () => "test-session",
    ...overrides,
  };
}

export type RunToolResult =
  | { ok: true; output: unknown }
  | { ok: false; error: string };

/**
 * Execute a tool contribution against `input`.
 *
 * Returns a result rather than throwing so a test can assert on failures as
 * easily as successes — which is the case authors get wrong most often, since
 * a tool that throws in the app comes back to the model as an error *result*,
 * not an exception.
 */
export async function runTool(
  contribution: ToolContribution,
  input: unknown,
  ctx: ToolContext = createTestToolContext(),
): Promise<RunToolResult> {
  const admission = admitTool(contribution, new Set());
  if (!admission.ok) return { ok: false, error: admission.reason };

  // Validate through the declared schema, exactly as the provider would
  // before the model's arguments ever reach `execute`. Skipping this is how
  // a tool passes its own tests and then receives a shape it never handles.
  const parsed = contribution.inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: `input failed schema: ${parsed.error.message}` };
  }

  try {
    return { ok: true, output: await contribution.execute(parsed.data as never, ctx) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
