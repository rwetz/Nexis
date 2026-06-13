// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock("@/modules/workspace", () => ({
  currentWorkspaceEnv: () => ({ kind: "local" }),
}));

import { useMlStore, getCompareData, type HistoricalRun } from "./store";

const metricsJsonl = (names: string[]) =>
  names
    .map((n, i) =>
      JSON.stringify({
        ev: "metric",
        run: "r",
        step: i + 1,
        epoch: 1,
        name: n,
        value: 1 / (i + 1),
      }),
    )
    .join("\n") + "\n";

const run = (id: string): HistoricalRun => ({
  id,
  dir: `proj/.nexis-ml/runs/${id}`,
  status: "ok",
});

describe("run comparison (store)", () => {
  beforeEach(async () => {
    const core = await import("@tauri-apps/api/core");
    const invokeMock = vi.mocked(core.invoke);
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "fs_read_file") {
        return {
          kind: "text",
          content: metricsJsonl(["loss/train", "loss/val"]),
          size: 100,
        };
      }
      return null;
    });
    useMlStore.getState().clearCompare();
  });

  it("toggles a run in and out, loading/dropping its series", async () => {
    await useMlStore.getState().toggleCompare(run("2026-a"));
    const added = useMlStore.getState().compareRuns;
    expect(added.map((r) => r.id)).toEqual(["2026-a"]);
    expect([...added[0].metrics].sort()).toEqual(["loss/train", "loss/val"]);
    expect(getCompareData().get("2026-a")?.has("loss/val")).toBe(true);

    await useMlStore.getState().toggleCompare(run("2026-a"));
    expect(useMlStore.getState().compareRuns).toHaveLength(0);
    expect(getCompareData().has("2026-a")).toBe(false);
  });

  it("assigns distinct colors and reuses a freed one", async () => {
    await useMlStore.getState().toggleCompare(run("a"));
    await useMlStore.getState().toggleCompare(run("b"));
    const colors = useMlStore.getState().compareRuns.map((r) => r.color);
    expect(new Set(colors).size).toBe(2);

    // remove the first, then add a third — it should take the freed color
    await useMlStore.getState().toggleCompare(run("a"));
    await useMlStore.getState().toggleCompare(run("c"));
    const after = useMlStore.getState().compareRuns;
    expect(after.map((r) => r.id)).toEqual(["b", "c"]);
    expect(after.find((r) => r.id === "c")?.color).toBe(colors[0]);
  });

  it("clearCompare empties both the list and the buffers", async () => {
    await useMlStore.getState().toggleCompare(run("x"));
    expect(getCompareData().size).toBe(1);
    useMlStore.getState().clearCompare();
    expect(useMlStore.getState().compareRuns).toHaveLength(0);
    expect(getCompareData().size).toBe(0);
  });
});
