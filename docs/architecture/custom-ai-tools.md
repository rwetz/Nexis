# Writing a custom AI tool

Nexis agents call *tools* — typed functions the model can invoke. The built-ins (`read_file`, `bash_run`, `edit`, …) cover general work; this guide is for adding your own, for something specific to your project or workflow.

A tool is three things: a **name** the model calls, a **description** that tells it when to, and a **schema + function** that does the work.

---

## Scaffold one

```bash
pnpm tool:new count_todos
```

That writes `src/plugins/custom-tools/count_todos.ts` and a matching test, registers the tool in the custom-tools plugin, and — the first time — wires that plugin into `ALL_PLUGINS`. The generated tool works and its test passes immediately; edit from there rather than starting from a stub.

Add `--auto` if the tool is read-only and should run without a confirmation prompt (see [Approval](#approval)).

Run its test:

```bash
pnpm exec vitest run src/plugins/custom-tools/count_todos.test.ts
```

---

## Anatomy

```ts
import { z } from "zod";
import type { ToolContribution } from "@/modules/ai/tools/plugin-tools";

export const countTodosTool: ToolContribution = {
  id: "custom:count_todos",       // registry id, unique per plugin
  name: "count_todos",            // what the model calls
  description:
    "Count TODO comments under a directory. Use when the user asks how much " +
    "unfinished work is left in a package.",
  inputSchema: z.object({
    dir: z.string().describe("Absolute path to search."),
  }),
  execute: async ({ dir }, ctx) => {
    return { dir, workspace: ctx.getWorkspaceRoot() };
  },
};
```

**The description is the most important field.** It is the entire basis on which the model decides whether to call your tool. A vague description ("does todo stuff") is the single most common reason a custom tool is never called. Say what it does *and when to reach for it*. The same applies to `.describe()` on each schema field — the model reads those too.

`execute` receives the validated input and a `ToolContext`, the same one built-ins get:

| Field | What it gives you |
| --- | --- |
| `getCwd()` | Active terminal's cwd (may be `null`) |
| `getWorkspaceRoot()` | Explorer root |
| `getTerminalContext()` | Tail of the active terminal buffer |
| `getSessionId()` | Current chat session |
| `injectIntoActivePty(text)` | Type at the prompt without executing |
| `openPreview(url)` | Open an in-app preview tab |

---

## Approval

Contributed tools **require user approval by default**. Each call surfaces a confirmation card, exactly like `write_file` and `bash_run`. This is deliberate: a custom tool is unreviewed code running inside the agent loop.

```ts
approval: "auto",   // runs without asking
```

Only set `"auto"` for tools that cannot modify anything — no writes, no network, no process spawning. If in doubt, leave it out.

---

## Rules the runtime enforces

Admission happens in `buildPluginTools` (`src/modules/ai/tools/plugin-tools.ts`). A contribution that breaks a rule is **logged and skipped** — never thrown — so one bad tool can't disarm the others or break a turn.

- **You cannot shadow a built-in.** `read_file`, `bash_run`, and the rest are reserved. Re-binding one would swap a guarded primitive for an unguarded one.
- **Names must be lowercase snake_case**, 3–48 characters, starting with a letter. The name crosses into the provider's function-calling schema, and an invalid one fails the whole request — not just your tool.
- **First registration wins** if two plugins claim the same name.
- **A description is mandatory.** The model cannot use an unlabelled tool.
- **Throwing is safe.** An exception is converted to an error *result* the model can read and recover from.

If your tool never shows up, check the devtools console — the rejection reason is logged with your tool's id.

---

## Testing

`runTool` executes a tool the way the agent loop would, including admission and schema validation, so a tool that would be rejected in the app fails in your test instead:

```ts
import { createTestToolContext, runTool } from "@/modules/ai/tools/harness";

const result = await runTool(
  countTodosTool,
  { dir: "/workspace/src" },
  createTestToolContext({ getCwd: () => "/workspace" }),
);
expect(result).toEqual({ ok: true, output: { /* … */ } });
```

`runTool` returns `{ ok: false, error }` rather than throwing, so failure paths are as easy to assert as success ones — worth doing, since a tool that throws in production comes back to the model as an error result, not an exception.

---

## Related

- `src/modules/ai/tools/plugin-tools.ts` — admission rules and the `ToolContribution` type
- `src/modules/ai/tools/harness.ts` — the test harness
- `src/lib/plugins/types.ts` — the wider Plugin API
- [`ai-subsystem.md`](./ai-subsystem.md) — how tools fit into the agent turn
