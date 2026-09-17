import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ emit: vi.fn(), listen: vi.fn() }));

import { invokeDap } from "./api";
import { debuggerCapability } from ".";

beforeEach(() => mocks.invoke.mockReset());

it("owns the debugger integration panel", () => {
  expect(debuggerCapability).toMatchObject({
    id: "debugger.dap",
    panels: [{
      id: "debugger:panel",
      legacyView: "debugger",
      pack: "code-tools",
      lifecycle: "unmount",
      showInRail: false,
    }],
  });
});

it("routes the DAP protocol through typed host commands", async () => {
  mocks.invoke.mockResolvedValueOnce(4).mockResolvedValue(undefined);
  await expect(
    invokeDap("dap_start", {
      adapterCmd: "debugpy",
      adapterArgs: [],
      adapterId: "python",
    }),
  ).resolves.toBe(4);
  await invokeDap("dap_stop", { sessionId: 4 });
  expect(mocks.invoke.mock.calls).toEqual([
    [
      "dap_start",
      { adapterCmd: "debugpy", adapterArgs: [], adapterId: "python" },
    ],
    ["dap_stop", { sessionId: 4 }],
  ]);
});
