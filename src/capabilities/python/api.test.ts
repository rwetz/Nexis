import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ emit: vi.fn(), listen: vi.fn() }));

import { python } from "./api";
import { pythonCapability } from ".";
import { useWorkspaceEnvStore } from "@/platform/workspaces";

beforeEach(() => {
  mocks.invoke.mockReset();
  useWorkspaceEnvStore.setState({ env: { kind: "wsl", distro: "Ubuntu" } });
});

it("declares shared Python environment discovery", () => {
  expect(pythonCapability).toMatchObject({
    id: "python.environments",
    panels: [],
  });
});

it("detects interpreters in the captured workspace environment", async () => {
  mocks.invoke.mockResolvedValue([]);
  await expect(python.detectEnvs("/home/me/project")).resolves.toEqual([]);
  expect(mocks.invoke).toHaveBeenCalledWith("py_detect_envs", {
    workspaceRoot: "/home/me/project",
    workspace: { kind: "wsl", distro: "Ubuntu" },
  });
});
