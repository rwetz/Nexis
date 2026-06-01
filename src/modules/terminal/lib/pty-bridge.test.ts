import { beforeEach, describe, expect, it, vi } from "vitest";
import { openPty } from "./pty-bridge";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  // Channel must work as a constructor (`new Channel<T>()`) and expose
  // a settable `onmessage` property (used by openPty for data/exit routing).
  Channel: vi.fn().mockImplementation(() => ({ onmessage: null })),
}));

vi.mock("@/modules/workspace", () => ({
  currentWorkspaceEnv: () => ({ kind: "local" }),
}));

describe("pty-bridge — pitfall 1C: workspace_authorize before pty_open", () => {
  let invokeMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const core = await import("@tauri-apps/api/core");
    invokeMock = vi.mocked(core.invoke);
    invokeMock.mockReset();
  });

  it("calls workspace_authorize BEFORE pty_open when a cwd is provided (pitfall 1C)", async () => {
    const callOrder: string[] = [];
    invokeMock.mockImplementation(async (cmd: string) => {
      callOrder.push(cmd);
      if (cmd === "workspace_authorize") return "/canonical/some/path";
      if (cmd === "pty_open") return 1;
      return null;
    });

    await openPty(80, 24, { onData: vi.fn() }, "/some/path");

    const waIdx = callOrder.indexOf("workspace_authorize");
    const ptyIdx = callOrder.indexOf("pty_open");

    expect(waIdx).toBeGreaterThanOrEqual(0);
    expect(ptyIdx).toBeGreaterThanOrEqual(0);
    // Authorization must precede the spawn so the upcoming pty_open
    // authorize_spawn_cwd check does not reject the path.
    expect(waIdx).toBeLessThan(ptyIdx);
  });

  it("does NOT call workspace_authorize when no cwd is provided (pitfall 1C)", async () => {
    const calls: string[] = [];
    invokeMock.mockImplementation(async (cmd: string) => {
      calls.push(cmd);
      if (cmd === "pty_open") return 2;
      return null;
    });

    // cwd omitted — openPty should skip the authorization step entirely.
    await openPty(80, 24, { onData: vi.fn() });

    expect(calls).not.toContain("workspace_authorize");
    expect(calls).toContain("pty_open");
  });

  it("still calls pty_open even when workspace_authorize rejects (non-fatal path)", async () => {
    const calls: string[] = [];
    invokeMock.mockImplementation(async (cmd: string) => {
      calls.push(cmd);
      if (cmd === "workspace_authorize") throw new Error("not found");
      if (cmd === "pty_open") return 3;
      return null;
    });

    // The .catch(() => {}) in openPty swallows the authorization failure and
    // lets pty_open proceed — the Rust side will produce a clearer error if
    // the cwd is genuinely inaccessible.
    await openPty(80, 24, { onData: vi.fn() }, "/nonexistent/path");

    expect(calls).toContain("workspace_authorize");
    expect(calls).toContain("pty_open");
  });
});
