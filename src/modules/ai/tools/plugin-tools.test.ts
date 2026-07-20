// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createTestToolContext, runTool } from "./harness";
import {
  RESERVED_TOOL_NAMES,
  admitTool,
  buildPluginTools,
  type ToolContribution,
} from "./plugin-tools";

const contribution = (over: Partial<ToolContribution> = {}): ToolContribution => ({
  id: "demo:thing",
  name: "do_thing",
  description: "Does the thing.",
  inputSchema: z.object({ value: z.string() }),
  execute: async ({ value }: never) => ({ echoed: value }),
  ...over,
});

describe("admitTool", () => {
  const none = new Set<string>();

  it("admits a well-formed contribution", () => {
    expect(admitTool(contribution(), none)).toEqual({ ok: true });
  });

  it("refuses to let a plugin shadow a built-in tool", () => {
    // The security case: re-binding read_file would swap a guarded primitive
    // for an unguarded one without the model or the user noticing.
    for (const name of ["read_file", "bash_run", "edit", "write_file"]) {
      const verdict = admitTool(contribution({ name }), none);
      expect(verdict.ok, `${name} must be reserved`).toBe(false);
      expect(verdict.ok === false && verdict.reason).toContain("built-in");
    }
  });

  it("rejects names providers would choke on", () => {
    for (const name of [
      "Do_Thing", // uppercase
      "do-thing", // hyphen
      "do thing", // space
      "1thing", // leading digit
      "ab", // too short
      "", // empty
      "x".repeat(49), // too long
    ]) {
      expect(admitTool(contribution({ name }), none).ok, name).toBe(false);
    }
  });

  it("accepts a name at the length boundaries", () => {
    expect(admitTool(contribution({ name: "abc" }), none).ok).toBe(true);
    expect(admitTool(contribution({ name: `a${"b".repeat(47)}` }), none).ok).toBe(true);
  });

  it("rejects a duplicate of an already-admitted name", () => {
    const taken = new Set(["do_thing"]);
    const verdict = admitTool(contribution(), taken);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toContain("duplicate");
  });

  it("rejects a contribution with no description", () => {
    expect(admitTool(contribution({ description: "   " }), none).ok).toBe(false);
  });

  it("rejects a contribution with no execute function", () => {
    expect(
      admitTool(contribution({ execute: undefined as never }), none).ok,
    ).toBe(false);
  });
});

describe("buildPluginTools", () => {
  const ctx = createTestToolContext();

  it("builds admitted tools keyed by name", () => {
    const tools = buildPluginTools([contribution()], ctx, () => {});
    expect(Object.keys(tools)).toEqual(["do_thing"]);
  });

  it("skips rejected contributions instead of throwing", () => {
    const onReject = vi.fn();
    const tools = buildPluginTools(
      [contribution({ name: "read_file" }), contribution()],
      ctx,
      onReject,
    );
    // The good tool still makes it — one bad plugin must not disarm the rest.
    expect(Object.keys(tools)).toEqual(["do_thing"]);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("keeps the first registration when two plugins claim a name", () => {
    const onReject = vi.fn();
    const first = contribution({ id: "a:t", description: "First." });
    const second = contribution({ id: "b:t", description: "Second." });
    const tools = buildPluginTools([first, second], ctx, onReject);
    expect(Object.keys(tools)).toHaveLength(1);
    expect(tools.do_thing.description).toBe("First.");
    expect(onReject).toHaveBeenCalledWith(second, expect.stringContaining("duplicate"));
  });

  it("requires approval by default and honours an explicit auto", () => {
    const tools = buildPluginTools(
      [contribution(), contribution({ id: "d:2", name: "read_only", approval: "auto" })],
      ctx,
      () => {},
    );
    // Unreviewed third-party code defaults to a human in the loop.
    expect(tools.do_thing.needsApproval).toBe(true);
    expect(tools.read_only.needsApproval).toBe(false);
  });

  it("returns an empty set for no contributions", () => {
    expect(buildPluginTools([], ctx, () => {})).toEqual({});
  });

  it("wires execute through to the contribution with the tool context", async () => {
    const tools = buildPluginTools(
      [contribution({ execute: (_i, c) => ({ root: c.getWorkspaceRoot() }) })],
      ctx,
      () => {},
    );
    await expect(
      tools.do_thing.execute?.({ value: "x" } as never, {} as never),
    ).resolves.toEqual({ root: "/workspace" });
  });

  it("converts a throwing tool into an error result the model can read", async () => {
    // An exception here would abort the whole turn; the model needs a result
    // it can reason about and retry from instead.
    const tools = buildPluginTools(
      [
        contribution({
          execute: () => {
            throw new Error("disk on fire");
          },
        }),
      ],
      ctx,
      () => {},
    );
    await expect(
      tools.do_thing.execute?.({ value: "x" } as never, {} as never),
    ).resolves.toEqual({ error: "disk on fire" });
  });

  it("logs the offending tool id when no reject handler is supplied", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    buildPluginTools([contribution({ id: "bad:tool", name: "grep" })], ctx);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("bad:tool"));
    warn.mockRestore();
  });
});

describe("runTool harness", () => {
  it("executes a tool and returns its output", async () => {
    const result = await runTool(contribution(), { value: "hi" });
    expect(result).toEqual({ ok: true, output: { echoed: "hi" } });
  });

  it("validates input against the declared schema before executing", async () => {
    const execute = vi.fn();
    const result = await runTool(contribution({ execute }), { value: 42 });
    expect(result.ok).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it("surfaces a rejected contribution as a failure, not a silent pass", async () => {
    // Authoring guard: a tool that could never be admitted at runtime must
    // fail in the author's own test rather than quietly never appearing.
    const result = await runTool(contribution({ name: "grep" }), { value: "x" });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("built-in");
  });

  it("turns a throwing tool into an error result", async () => {
    const result = await runTool(
      contribution({
        execute: () => {
          throw new Error("boom");
        },
      }),
      { value: "x" },
    );
    expect(result).toEqual({ ok: false, error: "boom" });
  });

  it("passes the tool context through to execute", async () => {
    const result = await runTool(
      contribution({ execute: (_i, c) => ({ cwd: c.getCwd() }) }),
      { value: "x" },
      createTestToolContext({ getCwd: () => "/custom" }),
    );
    expect(result).toEqual({ ok: true, output: { cwd: "/custom" } });
  });
});

describe("RESERVED_TOOL_NAMES stays in sync with the built-ins", () => {
  it("lists every tool buildTools actually registers", async () => {
    // The reserved list is hand-maintained data (deriving it would create an
    // import cycle). This asserts it against reality, so adding a built-in
    // without reserving its name fails here instead of leaving a hole a
    // plugin could occupy.
    const { buildTools } = await import("./tools");
    const builtinNames = Object.keys(buildTools(createTestToolContext()));
    expect([...RESERVED_TOOL_NAMES].sort()).toEqual(builtinNames.sort());
  });
});
