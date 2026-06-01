import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildShellTools } from "./shell";
import type { ToolContext } from "./context";

vi.mock("../lib/native", () => ({
  native: {
    shellSessionOpen: vi.fn(),
    shellSessionRun: vi.fn(),
    shellBgSpawn: vi.fn(),
    shellBgLogs: vi.fn(),
    shellBgList: vi.fn(),
    shellBgKill: vi.fn(),
  },
}));

vi.mock("@/modules/workspace", () => ({
  currentWorkspaceEnv: () => ({ kind: "local" }),
  workspaceScopeKey: () => "local",
}));

// Counter ensures each test uses a session ID that has never been cached.
let sessionCounter = 0;
function freshSessionId() {
  return `test-session-${++sessionCounter}`;
}

function makeCtx(sessionId: string): ToolContext {
  return {
    getSessionId: () => sessionId,
    getCwd: () => null,
    getWorkspaceRoot: () => null,
    getTerminalContext: () => null,
    isActiveTerminalPrivate: () => false,
    injectIntoActivePty: () => false,
    openPreview: () => false,
    readCache: new Map(),
  };
}

describe("shell — pitfall 10: session retry after rejection", () => {
  let nativeMod: typeof import("../lib/native");

  beforeEach(async () => {
    nativeMod = await import("../lib/native");
    vi.mocked(nativeMod.native.shellSessionOpen).mockReset();
    vi.mocked(nativeMod.native.shellSessionRun).mockReset();
    vi.mocked(nativeMod.native.shellSessionRun).mockResolvedValue({
      stdout: "hello",
      stderr: "",
      exit_code: 0,
      timed_out: false,
      truncated: false,
      cwd_after: "/",
    });
  });

  it("retries shellSessionOpen after a rejection rather than replaying the cached failed promise (pitfall 10)", async () => {
    let callCount = 0;
    vi.mocked(nativeMod.native.shellSessionOpen).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error("connection refused"));
      return Promise.resolve(99);
    });

    const sid = freshSessionId();
    const tools = buildShellTools(makeCtx(sid));

    // First call — must fail because shellSessionOpen rejects.
    const r1 = await (tools.bash_run as any).execute(
      { command: "echo hi" },
      {},
    );
    expect(r1).toHaveProperty("error");

    // Second call with the same session — must NOT replay the rejected promise.
    // It should open a new session and succeed.
    const r2 = await (tools.bash_run as any).execute(
      { command: "echo hi" },
      {},
    );
    expect(r2).not.toHaveProperty("error");
    expect(r2).toHaveProperty("stdout", "hello");

    // shellSessionOpen was called twice: once on failure, once on retry.
    expect(vi.mocked(nativeMod.native.shellSessionOpen)).toHaveBeenCalledTimes(2);
  });

  it("reuses a successfully opened session across multiple calls (not the pitfall, just a sanity check)", async () => {
    vi.mocked(nativeMod.native.shellSessionOpen).mockResolvedValue(7);

    const sid = freshSessionId();
    const tools = buildShellTools(makeCtx(sid));

    await (tools.bash_run as any).execute({ command: "echo a" }, {});
    await (tools.bash_run as any).execute({ command: "echo b" }, {});

    // Session was opened once; the second call should reuse it.
    expect(vi.mocked(nativeMod.native.shellSessionOpen)).toHaveBeenCalledTimes(1);
  });
});
