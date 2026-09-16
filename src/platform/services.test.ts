import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  emit: vi.fn(async () => {}),
  listen: vi.fn(async () => () => {}),
  windows: [] as Array<{
    callbacks: Map<string, (event: { payload: string }) => void>;
    cleanup: ReturnType<typeof vi.fn>;
  }>,
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  emit: mocks.emit,
  listen: mocks.listen,
}));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: class {
    static getByLabel = vi.fn(async () => null);
    callbacks = new Map<string, (event: { payload: string }) => void>();
    cleanup = vi.fn();
    constructor() {
      mocks.windows.push(this);
    }
    once(name: string, receive: (event: { payload: string }) => void) {
      this.callbacks.set(name, receive);
      return Promise.resolve(this.cleanup);
    }
  },
}));

import { filesystem, hostFilesystem } from "./filesystem";
import { hostProcesses, shellSessions } from "./processes";
import { useWorkspaceEnvStore } from "./workspaces";
import { ensureWindow } from "./windows";

beforeEach(() => {
  mocks.invoke.mockReset();
  useWorkspaceEnvStore.setState({ env: { kind: "wsl", distro: "Ubuntu" } });
});

it("file writes preserve caller paths and source while host exports reject WSL inheritance", async () => {
  mocks.invoke.mockResolvedValue(undefined);
  await filesystem.writeFile("/home/me/project/a.ts", "content", "editor");
  expect(mocks.invoke).toHaveBeenLastCalledWith("fs_write_file", {
    path: "/home/me/project/a.ts",
    content: "content",
    source: "editor",
    workspace: { kind: "wsl", distro: "Ubuntu" },
  });
  await hostFilesystem.writeFile(
    "C:/exports/results.csv",
    "csv",
    "benchmark-export",
  );
  expect(mocks.invoke).toHaveBeenLastCalledWith("fs_write_file", {
    path: "C:/exports/results.csv",
    content: "csv",
    source: "benchmark-export",
  });
  await filesystem.readDir("/home/me/project", false);
  expect(mocks.invoke).toHaveBeenLastCalledWith("fs_read_dir", {
    path: "/home/me/project",
    showHidden: false,
    workspace: { kind: "wsl", distro: "Ubuntu" },
  });
  await filesystem.listFiles("/home/me/project", {
    limit: 3_000,
    maxDepth: 10,
    showHidden: false,
  });
  expect(mocks.invoke).toHaveBeenLastCalledWith("fs_list_files", {
    root: "/home/me/project",
    limit: 3_000,
    maxDepth: 10,
    showHidden: false,
    workspace: { kind: "wsl", distro: "Ubuntu" },
  });
  await hostFilesystem.stat("C:/Users/me/AppData/Roaming/nexis/themes");
  expect(mocks.invoke).toHaveBeenLastCalledWith("fs_stat", {
    path: "C:/Users/me/AppData/Roaming/nexis/themes",
  });
  await hostProcesses.runCommand("netstat -ano", null, 10);
  expect(mocks.invoke).toHaveBeenLastCalledWith("shell_run_command", {
    command: "netstat -ano",
    cwd: null,
    timeoutSecs: 10,
  });
});

it("shell authorization, open and runs use the same captured environment across an await", async () => {
  let authorize!: () => void;
  mocks.invoke.mockImplementation(async (name: string) => {
    if (name === "workspace_authorize")
      await new Promise<void>((resolve) => {
        authorize = resolve;
      });
    return name === "shell_session_open" ? 7 : undefined;
  });
  const opening = shellSessions.open("/home/me/project");
  useWorkspaceEnvStore.setState({ env: { kind: "local" } });
  authorize();
  const session = await opening;
  await session.run("pwd", { timeoutSecs: 2 });
  const calls = mocks.invoke.mock.calls;
  expect(calls.map(([name]) => name)).toEqual([
    "workspace_authorize",
    "shell_session_open",
    "shell_session_run",
  ]);
  expect(calls.every(([, args]) => args.workspace.kind === "wsl")).toBe(true);
  expect(calls[1][1].cwd).toBe("/home/me/project");
  await session.close();
  await session.close();
  expect(
    mocks.invoke.mock.calls.filter(([name]) => name === "shell_session_close"),
  ).toHaveLength(1);
  await expect(session.run("pwd")).rejects.toThrow("closed");
});

it("concurrent named-window opens share creation and failed creation can retry", async () => {
  const first = ensureWindow("test-service-window", {});
  const second = ensureWindow("test-service-window", {});
  expect(second).toBe(first);
  await vi.waitFor(() => expect(mocks.windows).toHaveLength(1));
  mocks.windows[0].callbacks.get("tauri://created")!({ payload: "" });
  await first;
  expect(mocks.windows[0].cleanup).toHaveBeenCalledTimes(2);
  const failed = ensureWindow("test-failed-window", {});
  const failure = expect(failed).rejects.toThrow("creation failed");
  await vi.waitFor(() => expect(mocks.windows).toHaveLength(2));
  mocks.windows[1].callbacks.get("tauri://error")!({
    payload: "creation failed",
  });
  await failure;
  const retry = ensureWindow("test-failed-window", {});
  await vi.waitFor(() => expect(mocks.windows).toHaveLength(3));
  mocks.windows[2].callbacks.get("tauri://created")!({ payload: "" });
  await retry;
  expect(mocks.windows[1].cleanup).toHaveBeenCalledTimes(2);
});
