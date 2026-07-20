#!/usr/bin/env node
// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Scaffold a custom AI tool.
 *
 *   pnpm tool:new <tool_name> [--auto]
 *
 * Writes a tool + its test into `src/plugins/custom-tools/`, and registers
 * the tool in that directory's plugin so it is live on the next reload.
 *
 * The generated pair is deliberately a *working* tool with a *passing* test,
 * not a stub full of TODOs: the fastest way to learn this surface is to run
 * something that works and then change it.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "src/plugins/custom-tools");

const NAME_RE = /^[a-z][a-z0-9_]{2,47}$/;

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const auto = args.includes("--auto");
const name = args.find((a) => !a.startsWith("--"));

if (!name) {
  fail("usage: pnpm tool:new <tool_name> [--auto]\n" +
       "  <tool_name>  snake_case, 3-48 chars (e.g. count_todos)\n" +
       "  --auto       run without asking for approval (read-only tools only)");
}
if (!NAME_RE.test(name)) {
  fail(`"${name}" is not a valid tool name — 3-48 chars, lowercase snake_case, starting with a letter`);
}

// Mirror the runtime reserved list rather than importing it: this script runs
// as plain Node with no TS pipeline. The runtime check is authoritative; this
// one just fails fast with a clearer message than a silent rejection later.
const RESERVED = [
  "read_file", "list_directory", "create_directory", "write_file",
  "edit", "multi_edit", "grep", "glob",
  "bash_run", "bash_background", "bash_logs", "bash_kill", "bash_list",
  "run_subagent", "get_terminal_output", "suggest_command", "open_preview",
  "todo_write",
];
if (RESERVED.includes(name)) {
  fail(`"${name}" is a built-in tool name — pick another (it would be rejected at runtime)`);
}

const toolFile = path.join(DIR, `${name}.ts`);
const testFile = path.join(DIR, `${name}.test.ts`);
if (fs.existsSync(toolFile)) fail(`${path.relative(ROOT, toolFile)} already exists`);

fs.mkdirSync(DIR, { recursive: true });

const header = `// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝
`;

const camel = name.replace(/_(.)/g, (_, c) => c.toUpperCase());

fs.writeFileSync(
  toolFile,
  `${header}
import { z } from "zod";
import type { ToolContribution } from "@/modules/ai/tools/plugin-tools";

/**
 * ${name} — describe what this tool does.
 *
 * The description below is what the MODEL reads to decide whether to call
 * this tool, so say what it does *and when to use it*. A vague description is
 * the single most common reason a custom tool never gets called.
 */
export const ${camel}Tool: ToolContribution = {
  id: "custom:${name}",
  name: "${name}",
  description:
    "Describe what this does and when the model should reach for it.",
  inputSchema: z.object({
    // Every field's .describe() is visible to the model — use it.
    subject: z.string().describe("What to operate on."),
  }),${auto ? `
  // Runs without asking. Only correct for genuinely read-only work.
  approval: "auto",` : `
  // Defaults to "ask": the user confirms each call. Switch to "auto" only if
  // this tool cannot modify anything.`}
  execute: async ({ subject }, ctx) => {
    // ctx gives you the same context the built-in tools get.
    return { subject, cwd: ctx.getCwd() };
  },
};
`,
);

fs.writeFileSync(
  testFile,
  `${header}
import { describe, expect, it } from "vitest";
import { createTestToolContext, runTool } from "@/modules/ai/tools/harness";
import { ${camel}Tool } from "./${name}";

describe("${name}", () => {
  it("returns the subject and the active cwd", async () => {
    const result = await runTool(
      ${camel}Tool,
      { subject: "hello" },
      createTestToolContext({ getCwd: () => "/tmp/project" }),
    );
    expect(result).toEqual({
      ok: true,
      output: { subject: "hello", cwd: "/tmp/project" },
    });
  });

  it("rejects input that does not match the schema", async () => {
    const result = await runTool(${camel}Tool, { subject: 123 });
    expect(result.ok).toBe(false);
  });
});
`,
);

// ── Register it in the custom-tools plugin ───────────────────────────────────

const pluginFile = path.join(DIR, "index.ts");
if (!fs.existsSync(pluginFile)) {
  fs.writeFileSync(
    pluginFile,
    `${header}
/**
 * Custom tools plugin — registers every tool scaffolded by
 * \`pnpm tool:new\`. Generated entries are added below; edit freely.
 *
 * Remember to add \`customToolsPlugin\` to ALL_PLUGINS in src/plugins/index.ts
 * (the scaffold does this for you the first time).
 */
import type { Plugin } from "@/lib/plugins/types";
import { combineDisposables } from "@/lib/plugins/types";

// <<< nexis:tool-imports >>>

export const customToolsPlugin: Plugin = {
  id: "nexis.custom-tools",
  name: "Custom Tools",

  activate(api) {
    return combineDisposables(
      // <<< nexis:tool-registrations >>>
    );
  },
};
`,
  );
}

let plugin = fs.readFileSync(pluginFile, "utf8");
plugin = plugin.replace(
  "// <<< nexis:tool-imports >>>",
  `import { ${camel}Tool } from "./${name}";\n// <<< nexis:tool-imports >>>`,
);
plugin = plugin.replace(
  "// <<< nexis:tool-registrations >>>",
  `api.registerTool(${camel}Tool),\n      // <<< nexis:tool-registrations >>>`,
);
fs.writeFileSync(pluginFile, plugin);

// Wire the plugin into ALL_PLUGINS once.
const allPlugins = path.join(ROOT, "src/plugins/index.ts");
let all = fs.readFileSync(allPlugins, "utf8");
if (!all.includes("customToolsPlugin")) {
  all = all.replace(
    'import { mlPlugin } from "./ml";',
    'import { mlPlugin } from "./ml";\nimport { customToolsPlugin } from "./custom-tools";',
  );
  all = all.replace(
    "export const ALL_PLUGINS = [pythonPlugin, containersPlugin, mlPlugin] as const;",
    "export const ALL_PLUGINS = [\n  pythonPlugin,\n  containersPlugin,\n  mlPlugin,\n  customToolsPlugin,\n] as const;",
  );
  fs.writeFileSync(allPlugins, all);
  console.log("registered customToolsPlugin in src/plugins/index.ts");
}

const rel = (p) => path.relative(ROOT, p);
console.log(`
created ${rel(toolFile)}
created ${rel(testFile)}
registered "${name}"${auto ? " (auto-approve)" : " (asks for approval)"} in ${rel(pluginFile)}

next:
  pnpm exec vitest run ${rel(testFile)}
  # then edit the description and schema — the description is what decides
  # whether the model ever calls your tool.
`);
