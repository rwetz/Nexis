import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(async (_name: string, _receive: (event: unknown) => void) => vi.fn()),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(),
  listen: mocks.listen,
}));

import { createMlWorkspaceApi, mlHost, subscribeMlProtocol } from "./api";
import { mlCapability } from ".";
import { ipcForEnvironment } from "@/platform/workspaces";

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.listen.mockClear();
});

it("owns the ML Lab integration panel", () => {
  expect(mlCapability).toMatchObject({
    id: "ml.engine",
    panels: [{
      id: "ml:lab",
      legacyView: "ml",
      pack: "ml-lab",
      lifecycle: "unmount",
      showInRail: false,
    }],
  });
});

it("separates workspace engine launches from host session control", async () => {
  mocks.invoke.mockResolvedValueOnce(12).mockResolvedValue(undefined);
  const ml = createMlWorkspaceApi(
    ipcForEnvironment({ kind: "wsl", distro: "Ubuntu" }),
  );
  await expect(ml.spawn("nexis-ml", ["train", "."], "/home/me/project")).resolves.toBe(12);
  await mlHost.cancel(12);
  expect(mocks.invoke.mock.calls).toEqual([
    [
      "ml_spawn",
      {
        exe: "nexis-ml",
        args: ["train", "."],
        projectDir: "/home/me/project",
        workspace: { kind: "wsl", distro: "Ubuntu" },
      },
    ],
    ["ml_cancel", { sid: 12 }],
  ]);
});

it("owns one disposable scope for the three protocol events", async () => {
  const dispose = subscribeMlProtocol({
    onProto: vi.fn(),
    onStderr: vi.fn(),
    onExit: vi.fn(),
  });
  await vi.waitFor(() => expect(mocks.listen).toHaveBeenCalledTimes(3));
  dispose();
  expect(mocks.listen.mock.calls.map(([name]) => name)).toEqual([
    "ml:proto",
    "ml:stderr",
    "ml:exit",
  ]);
});
