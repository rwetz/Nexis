import { describe, expect, it, vi } from "vitest";
import { Lifetime } from "./lifetime";
import {
  createPlatformIpc,
  defineCommand,
  defineEvent,
  type PlatformTransport,
} from "./ipc";
import { createWorkspaceContext, type WorkspaceEnvironment } from "./workspace";
import { serializeWrites } from "./persistence";
import { createProcessService } from "./process";

function fixture() {
  let environment: WorkspaceEnvironment = { kind: "wsl", distro: "Ubuntu" };
  let roots = ["/home/me/project"];
  const authorize = vi.fn(async (path: string) => path);
  const workspace = createWorkspaceContext(
    () => ({ environment, roots }),
    authorize,
  );
  const invoke = vi.fn(async () => 42);
  const transport = {
    invoke,
    listen: vi.fn(),
    emit: vi.fn(),
  } as unknown as PlatformTransport;
  return {
    workspace,
    authorize,
    invoke,
    transport,
    switchRoot: (value: string[]) => {
      roots = value;
    },
    switchEnv: (value: WorkspaceEnvironment) => {
      environment = value;
    },
  };
}

describe("platform contracts", () => {
  it("separates host and workspace payloads and rejects caller overrides", async () => {
    const f = fixture();
    const ipc = createPlatformIpc(f.transport, f.workspace);
    const host = defineCommand<{ path: string }, number>("host_read", "host");
    const scoped = defineCommand<{ path: string }, number>(
      "workspace_read",
      "workspace",
    );
    await expect(ipc.call(host, { path: "C:/repo" })).resolves.toBe(42);
    expect(f.invoke).toHaveBeenLastCalledWith("host_read", { path: "C:/repo" });
    await ipc.call(scoped, { path: "/home/me/project" });
    expect(f.invoke).toHaveBeenLastCalledWith("workspace_read", {
      path: "/home/me/project",
      workspace: { kind: "wsl", distro: "Ubuntu" },
    });
    expect(() =>
      ipc.call(host, { path: "x", workspace: {} } as { path: string }),
    ).toThrow("scope");
    expect(() =>
      createPlatformIpc(f.transport).call(scoped, { path: "x" }),
    ).toThrow("requires");
    // @ts-expect-error Command arguments cannot be inferred away from the descriptor.
    if (false) ipc.call(host, { path: 4 });
  });

  it("snapshots roots independently of environment identity", () => {
    const f = fixture();
    const before = f.workspace.snapshot();
    f.switchRoot(["/b", "/a", "/a"]);
    const after = f.workspace.snapshot();
    expect(after.environmentId).toBe(before.environmentId);
    expect(after.scopeId).not.toBe(before.scopeId);
    expect(after.roots).toEqual(["/a", "/b"]);
    expect(before.roots).toEqual(["/home/me/project"]);
  });

  it("disposes late event registration and ignores events after teardown", async () => {
    const f = fixture();
    let resolve!: (cleanup: () => void) => void;
    let receive!: (value: unknown) => void;
    f.transport.listen = vi.fn((_name, cb) => {
      receive = cb;
      return new Promise<() => void>((done) => {
        resolve = done;
      });
    });
    const events = createPlatformIpc(f.transport, f.workspace).events();
    const callback = vi.fn();
    const event = defineEvent<string>("event");
    const pending = events.listen(event, callback);
    events.dispose();
    receive("late");
    const cleanup = vi.fn();
    resolve(cleanup);
    (await pending).dispose();
    expect(callback).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(1);
    await expect(events.listen(event, callback)).rejects.toThrow("disposed");
  });

  it("cleans up remaining resources even if one disposer throws", () => {
    const lifetime = new Lifetime();
    lifetime.add(() => {
      throw new Error("failed");
    });
    const cleanup = vi.fn();
    lifetime.add(cleanup);
    expect(() => lifetime.dispose()).toThrow("cleanup");
    lifetime.dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("orders persistence commits and recovers after a failed write", async () => {
    const order: number[] = [];
    const service = serializeWrites<{ value: number }>({
      read: async () => 0,
      subscribe: async () => ({ dispose() {} }),
      write: async (_key, value) => {
        order.push(value);
        if (value === 1) throw new Error("disk full");
      },
    });
    const first = service.write("value", 1);
    const second = service.write("value", 2);
    await expect(first).rejects.toThrow("disk full");
    await second;
    expect(order).toEqual([1, 2]);
  });

  it("authorizes before opening and keeps the captured environment and Linux cwd", async () => {
    const f = fixture();
    const close = vi.fn(async () => {});
    const run = vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 }));
    const open = vi.fn(async () => ({ run, close }));
    const service = createProcessService(f.workspace, open);
    const pending = service.open("/home/me/project");
    f.switchEnv({ kind: "local" });
    const session = await pending;
    expect(f.authorize).toHaveBeenCalledWith("/home/me/project", {
      kind: "wsl",
      distro: "Ubuntu",
    });
    expect(open.mock.calls[0]).toEqual([
      "/home/me/project",
      expect.objectContaining({ environmentId: "wsl:Ubuntu" }),
    ]);
    await session.close();
    await session.close();
    await expect(session.run("echo no")).rejects.toThrow("closed");
    expect(close).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();
  });

  it("cancels queued work on close and never opens after failed authorization", async () => {
    const f = fixture();
    f.authorize.mockRejectedValueOnce(new Error("outside roots"));
    const run = vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 }));
    const open = vi.fn(async () => ({ run, close: async () => {} }));
    const service = createProcessService(f.workspace, open);
    await expect(service.open("/outside")).rejects.toThrow("outside roots");
    expect(open).not.toHaveBeenCalled();
    const session = await service.open("/home/me/project");
    const pending = session.run("must not start");
    const closing = session.close();
    await expect(pending).rejects.toThrow("closed");
    await closing;
    expect(run).not.toHaveBeenCalled();
  });
});
