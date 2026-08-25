// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { beforeEach, describe, expect, it, vi } from "vitest";
import { openPty } from "./pty-bridge";
import { currentWorkspaceEnv } from "@/modules/workspace";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  // Channel must work as a constructor (`new Channel<T>()`) and expose
  // a settable `onmessage` property (used by openPty for data/exit routing).
  Channel: vi.fn().mockImplementation(() => ({ onmessage: null })),
}));

vi.mock("@/modules/workspace", () => ({
  currentWorkspaceEnv: vi.fn(() => ({ kind: "local" })),
}));

describe("pty-bridge — pitfall 1C: workspace_authorize before pty_open", () => {
  let invokeMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const core = await import("@tauri-apps/api/core");
    invokeMock = vi.mocked(core.invoke);
    invokeMock.mockReset();
  });

  it("forwards cwd, shell and extraEnv to pty_open verbatim", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    invokeMock.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      calls.push({ cmd, args });
      if (cmd === "workspace_authorize") return "/canonical";
      if (cmd === "pty_open") return 10;
      return null;
    });

    await openPty(
      100,
      30,
      { onData: vi.fn() },
      "/some/path",
      { FOO: "1" },
      " /bin/bash ",
    );

    const open = calls.find((c) => c.cmd === "pty_open");
    expect(open?.args).toMatchObject({
      cols: 100,
      rows: 30,
      cwd: "/some/path",
      // The shell preference is trimmed; a surrounding-space path must still
      // resolve, not be dropped as blank.
      shell: "/bin/bash",
      extraEnv: { FOO: "1" },
    });
  });

  it("normalizes empty optional arguments to null", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    invokeMock.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      calls.push({ cmd, args });
      if (cmd === "pty_open") return 11;
      return null;
    });

    await openPty(80, 24, { onData: vi.fn() }, undefined, {}, "   ");

    const open = calls.find((c) => c.cmd === "pty_open");
    expect(open?.args).toMatchObject({
      cwd: null,
      // An empty env map and whitespace-only shell preference mean "unset" —
      // the backend treats absent differently from empty in some code paths.
      extraEnv: null,
      shell: null,
    });
  });

  it("stamps the current workspace environment onto both IPC calls", async () => {
    vi.mocked(currentWorkspaceEnv).mockReturnValue({
      kind: "wsl",
      distro: "Ubuntu-22.04",
    });
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    invokeMock.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      calls.push({ cmd, args });
      if (cmd === "workspace_authorize") return "/canonical";
      if (cmd === "pty_open") return 12;
      return null;
    });

    await openPty(80, 24, { onData: vi.fn() }, "/home/ryan/repo");

    // Both authorize and open must carry the same workspace stamp — the
    // Rust side resolves POSIX cwds through the distro named here.
    for (const cmd of ["workspace_authorize", "pty_open"]) {
      const call = calls.find((c) => c.cmd === cmd);
      expect(call?.args?.workspace).toEqual({ kind: "wsl", distro: "Ubuntu-22.04" });
    }
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

describe("pty-bridge — pitfall 19: inaccessible cwd falls back instead of bricking the tab", () => {
  let invokeMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const core = await import("@tauri-apps/api/core");
    invokeMock = vi.mocked(core.invoke);
    invokeMock.mockReset();
  });

  it("retries pty_open without a cwd when the spawn rejects with 'cwd not accessible'", async () => {
    const cwdsSeen: (string | null)[] = [];
    invokeMock.mockImplementation(async (cmd: string, args?: { cwd?: string | null }) => {
      if (cmd === "workspace_authorize") return "/canonical/path";
      if (cmd === "pty_open") {
        if (args?.cwd) {
          cwdsSeen.push(args.cwd);
          throw new Error(
            "cwd not accessible: /gone (/gone): The system cannot find the path specified. (os error 3)",
          );
        }
        cwdsSeen.push(null);
        return 7;
      }
      return null;
    });

    const pty = await openPty(80, 24, { onData: vi.fn() }, "//?/C:/gone");

    expect(cwdsSeen).toEqual(["//?/C:/gone", null]);
    expect(pty.id).toBe(7);
  });

  it("does NOT retry when the failure is unrelated to the cwd", async () => {
    let ptyOpenCalls = 0;
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "workspace_authorize") return "/canonical/path";
      if (cmd === "pty_open") {
        ptyOpenCalls++;
        throw new Error("shell not found");
      }
      return null;
    });

    await expect(openPty(80, 24, { onData: vi.fn() }, "/some/path")).rejects.toThrow(
      "shell not found",
    );
    expect(ptyOpenCalls).toBe(1);
  });
});
