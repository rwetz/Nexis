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
  currentWorkspaceScopeKey: () => "local",
}));
vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: vi.fn(async () => {}),
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

describe("run metadata (store)", () => {
  beforeEach(async () => {
    const core = await import("@tauri-apps/api/core");
    const invokeMock = vi.mocked(core.invoke);
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(null); // fs_write_file resolves
    useMlStore.setState({
      runs: [
        { id: "b", dir: "proj/.nexis-ml/runs/b", status: "ok" },
        { id: "a", dir: "proj/.nexis-ml/runs/a", status: "ok" },
      ],
    });
  });

  it("setRunMeta updates the run and pinning sorts it first", async () => {
    await useMlStore.getState().setRunMeta(run("a"), { pinned: true, note: "best so far" });
    const runs = useMlStore.getState().runs;
    expect(runs[0].id).toBe("a"); // pinned floats to the top
    expect(runs[0].pinned).toBe(true);
    expect(runs[0].note).toBe("best so far");
    expect(runs[1].pinned).toBeFalsy();
  });

  it("writes notes.json for the run via fs_write_file", async () => {
    const core = await import("@tauri-apps/api/core");
    const invokeMock = vi.mocked(core.invoke);
    await useMlStore.getState().setRunMeta(run("b"), { tags: ["baseline"] });
    const call = invokeMock.mock.calls.find((c) => c[0] === "fs_write_file");
    expect(call).toBeTruthy();
    const args = call?.[1] as { path: string; content: string };
    expect(args.path).toBe("proj/.nexis-ml/runs/b/notes.json");
    expect(JSON.parse(args.content)).toMatchObject({ tags: ["baseline"], pinned: false });
  });
});

describe("project discovery (store)", () => {
  /** Mock the fs surface: `files` is the set of paths that exist. */
  const mockFs = async (files: Set<string>, rootEntries: string[]) => {
    const core = await import("@tauri-apps/api/core");
    const invokeMock = vi.mocked(core.invoke);
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (cmd: string, args?: unknown) => {
      const a = args as { path?: string } | undefined;
      if (cmd === "fs_read_dir") {
        if (a?.path === "ws") {
          return rootEntries.map((name) => ({ name, kind: "dir", size: 0, mtime: 0 }));
        }
        throw new Error(`not found: ${a?.path}`); // e.g. .nexis-ml/runs
      }
      if (cmd === "fs_stat") {
        if (a?.path && files.has(a.path)) return { size: 1, mtime: 0, kind: "file" };
        throw new Error(`not found: ${a?.path}`);
      }
      return null;
    });
  };

  it("discovers config-only projects (train.toml, no train.py) — the Rust engine's layout", async () => {
    // Regression: discovery used to require train.py, so projects scaffolded
    // by the standalone Rust engine (train.toml only) were invisible and the
    // panel showed the create card next to a fully trained model.
    await mockFs(new Set(["ws/rust-model/train.toml"]), ["rust-model", "docs"]);
    await useMlStore.getState().refreshProjects("ws");
    const projects = useMlStore.getState().projects;
    expect(projects.map((p) => p.name)).toEqual(["rust-model"]);
    expect(projects[0].hasOnnx).toBe(false);
  });

  it("still discovers legacy train.py-only projects", async () => {
    await mockFs(new Set(["ws/old-python/train.py"]), ["old-python"]);
    await useMlStore.getState().refreshProjects("ws");
    expect(useMlStore.getState().projects.map((p) => p.name)).toEqual(["old-python"]);
  });

  it("flags projects with an exported model.onnx", async () => {
    await mockFs(
      new Set(["ws/exported/train.toml", "ws/exported/model.onnx"]),
      ["exported"],
    );
    await useMlStore.getState().refreshProjects("ws");
    expect(useMlStore.getState().projects[0]?.hasOnnx).toBe(true);
  });

  it("reports no models when nothing in the folder is a project", async () => {
    await mockFs(new Set(), ["docs", "src"]);
    await useMlStore.getState().refreshProjects("ws");
    expect(useMlStore.getState().projects).toEqual([]);
    expect(useMlStore.getState().selectedProject).toBeNull();
  });
});

describe("install lifecycle (store)", () => {
  beforeEach(() => {
    useMlStore.setState({
      installing: false,
      installSid: null,
      installFlavor: null,
      installQueue: [],
      installRoot: null,
      pendingCreate: null,
      engineError: null,
      logs: [],
    });
  });

  // The setup card disables both "Install engine" and "Check again" while
  // `installing` is true, and nothing else clears it — so an install whose
  // exit went unmatched left the panel with no way back short of a restart.
  // `installSid` is only recorded after `await spawnInstall(...)` resolves,
  // which is exactly the window a fast failure lands in.
  it("clears `installing` when an install exits before its sid is recorded", () => {
    useMlStore.setState({ installing: true, installSid: null, installFlavor: "git" });

    useMlStore.getState()._applyExit({ sid: 7, code: 1 });

    const s = useMlStore.getState();
    expect(s.installing).toBe(false);
    expect(s.installSid).toBeNull();
    expect(s.engineError).toMatch(/install failed/i);
  });

  it("keeps pip output in the log during that same window", () => {
    useMlStore.setState({ installing: true, installSid: null });

    useMlStore.getState()._applyStderr({ sid: 7, line: "ERROR: no matching distribution" });

    expect(useMlStore.getState().logs).toContain(
      "ERROR: no matching distribution",
    );
  });

  // The fallback must not swallow a different one-shot's exit: the scaffold
  // branch is checked *after* the install branch.
  it("does not claim a project scaffold's exit as the install's", () => {
    useMlStore.setState({
      installing: true,
      installSid: null,
      pendingCreate: { sid: 7, workspaceRoot: "/w", dir: "/w/m", autoTrain: false },
    });

    useMlStore.getState()._applyExit({ sid: 7, code: 0 });

    expect(useMlStore.getState().installing).toBe(true);
    expect(useMlStore.getState().pendingCreate).toBeNull();
  });

  it("still matches the normal case once the sid is known", () => {
    useMlStore.setState({ installing: true, installSid: 4, installFlavor: "git" });

    useMlStore.getState()._applyExit({ sid: 4, code: 1 });

    expect(useMlStore.getState().installing).toBe(false);
  });
});
