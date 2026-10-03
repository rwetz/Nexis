// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock("./lib/headless", () => ({ isHeadlessSid: (sid: number) => sid === 99 }));

import { useMlStore } from "./store";

describe("headless sessions are invisible to the panel store", () => {
  beforeEach(() => {
    useMlStore.setState({ installing: false, installSid: null, serve: null, activeRun: null, logs: [] });
  });

  it("an exit during an install's unstamped window is not taken for the install's", () => {
    useMlStore.setState({ installing: true, installSid: null });
    useMlStore.getState()._applyExit({ sid: 99, code: 0 });
    expect(useMlStore.getState().installing).toBe(true);
  });

  it("a ready batch is not adopted by a pending playground", () => {
    useMlStore.setState({
      serve: {
        sid: -1,
        projectDir: "/ws/p",
        runId: "r",
        status: "starting",
        template: null,
        device: null,
        meta: null,
        busy: false,
        error: null,
        result: null,
      },
    });
    useMlStore.getState()._applyProto({ sid: 99, lines: ['{"ev":"ready","template":"tabular"}'] });
    expect(useMlStore.getState().serve?.sid).toBe(-1);
    expect(useMlStore.getState().serve?.status).toBe("starting");
  });

  it("its stderr stays out of the panel log", () => {
    useMlStore.setState({ installing: true, installSid: null });
    useMlStore.getState()._applyStderr({ sid: 99, line: "loading model" });
    expect(useMlStore.getState().logs).toEqual([]);
  });
});
