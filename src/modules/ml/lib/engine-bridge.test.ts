// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ancestorVenvCandidates,
  buildCandidates,
  detectEngine,
  resetEngineDetection,
  sendInfer,
  siblingExe,
  spawnExport,
  spawnNew,
  spawnServe,
  spawnTrain,
} from "./engine-bridge";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));

vi.mock("@/modules/workspace", () => ({
  currentWorkspaceEnv: () => ({ kind: "local" }),
}));

let invokeMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  const core = await import("@tauri-apps/api/core");
  invokeMock = vi.mocked(core.invoke);
  invokeMock.mockReset();
  resetEngineDetection();
});

describe("candidate building", () => {
  it("derives the engine exe next to the env's python (both layouts)", () => {
    expect(siblingExe("C:\\proj\\.venv\\Scripts\\python.exe")).toBe(
      "C:\\proj\\.venv\\Scripts\\nexis-ml.exe",
    );
    expect(siblingExe("/home/u/.venv/bin/python3")).toBe(
      "/home/u/.venv/bin/nexis-ml",
    );
    expect(siblingExe("python")).toBeNull();
  });

  it("dedupes env candidates and always falls back to PATH", () => {
    const candidates = buildCandidates([
      { python_path: "C:\\a\\.venv\\Scripts\\python.exe" },
      { python_path: "C:\\a\\.venv\\Scripts\\python.exe" },
    ]);
    expect(candidates).toHaveLength(2);
    expect(candidates[candidates.length - 1]).toBe("nexis-ml");
  });

  it("PATH-only when no envs detected and no workspace", () => {
    expect(buildCandidates([])).toEqual(["nexis-ml"]);
  });

  it("walks ancestor dirs for .venv/venv (repo venv serving a subproject)", () => {
    const candidates = ancestorVenvCandidates("E:\\nexis-ml\\scratch\\demo");
    // The case from the live test: demo project, venv two levels up.
    expect(candidates).toContain("E:/nexis-ml/.venv/Scripts/nexis-ml.exe");
    expect(candidates).toContain("E:/nexis-ml/scratch/demo/.venv/Scripts/nexis-ml.exe");
    expect(candidates).toContain("E:/nexis-ml/venv/Scripts/nexis-ml.exe");
    // stops at the drive root — no "E:/.venv"
    expect(candidates).not.toContain("E:/.venv/Scripts/nexis-ml.exe");
  });

  it("buildCandidates merges env siblings, ancestor venvs, then PATH", () => {
    const candidates = buildCandidates(
      [{ python_path: "C:\\Python313\\python.exe" }],
      "E:\\nexis-ml\\scratch\\demo",
    );
    expect(candidates[0]).toBe("C:\\Python313\\nexis-ml.exe");
    expect(candidates).toContain("E:/nexis-ml/.venv/Scripts/nexis-ml.exe");
    expect(candidates[candidates.length - 1]).toBe("nexis-ml");
  });
});

describe("detectEngine — pitfall #10: rejected promises must not be cached", () => {
  it("memoizes successful detection", async () => {
    invokeMock.mockResolvedValue({ exe: "nexis-ml", version: "0.1.0" });
    const a = await detectEngine(["nexis-ml"]);
    const b = await detectEngine(["nexis-ml"]);
    expect(a).toEqual(b);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("retries after a failed detection instead of replaying the rejection", async () => {
    invokeMock.mockRejectedValueOnce("not found");
    await expect(detectEngine(["nexis-ml"])).rejects.toBe("not found");

    // The engine got installed in the meantime…
    invokeMock.mockResolvedValueOnce({ exe: "nexis-ml", version: "0.1.0" });
    await expect(detectEngine(["nexis-ml"])).resolves.toEqual({
      exe: "nexis-ml",
      version: "0.1.0",
    });
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });
});

describe("spawnTrain — pitfall #1C: authorize before spawn", () => {
  it("calls workspace_authorize BEFORE ml_spawn", async () => {
    const order: string[] = [];
    invokeMock.mockImplementation(async (cmd: string) => {
      order.push(cmd);
      if (cmd === "workspace_authorize") return "E:\\proj";
      if (cmd === "ml_spawn") return 7;
      return null;
    });

    const sid = await spawnTrain("nexis-ml", "E:\\proj");

    expect(sid).toBe(7);
    expect(order.indexOf("workspace_authorize")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("workspace_authorize")).toBeLessThan(
      order.indexOf("ml_spawn"),
    );
  });

  it("still spawns when authorization errors (engine reports the real cause)", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "workspace_authorize") throw new Error("nope");
      if (cmd === "ml_spawn") return 3;
      return null;
    });
    await expect(spawnTrain("nexis-ml", "E:\\proj")).resolves.toBe(3);
  });
});

describe("spawnNew — scaffolds the chosen template", () => {
  it("passes `new <template> <name>` and authorizes the workspace first", async () => {
    const order: string[] = [];
    let spawnArgs: unknown;
    invokeMock.mockImplementation(async (cmd: string, args?: unknown) => {
      order.push(cmd);
      if (cmd === "workspace_authorize") return "E:\\ws";
      if (cmd === "ml_spawn") {
        spawnArgs = args;
        return 11;
      }
      return null;
    });

    const sid = await spawnNew("nexis-ml", "E:\\ws", "textgen", "tiny-writer");

    expect(sid).toBe(11);
    expect(order.indexOf("workspace_authorize")).toBeLessThan(
      order.indexOf("ml_spawn"),
    );
    expect(spawnArgs).toMatchObject({
      args: ["new", "textgen", "tiny-writer"],
      projectDir: "E:\\ws",
    });
  });
});

describe("serve bridge", () => {
  it("spawnServe authorizes then spawns `serve --run <id> --checkpoint`", async () => {
    const order: string[] = [];
    let spawnArgs: unknown;
    invokeMock.mockImplementation(async (cmd: string, args?: unknown) => {
      order.push(cmd);
      if (cmd === "workspace_authorize") return "E:\\proj";
      if (cmd === "ml_spawn") {
        spawnArgs = args;
        return 5;
      }
      return null;
    });

    const sid = await spawnServe("nexis-ml", "E:\\proj", "2026-run", "best");

    expect(sid).toBe(5);
    expect(order.indexOf("workspace_authorize")).toBeLessThan(
      order.indexOf("ml_spawn"),
    );
    expect(spawnArgs).toMatchObject({
      args: ["serve", "--run", "2026-run", "--checkpoint", "best"],
      projectDir: "E:\\proj",
    });
  });

  it("sendInfer writes the request as a single JSON line via ml_stdin", async () => {
    let stdinArgs: unknown;
    invokeMock.mockImplementation(async (cmd: string, args?: unknown) => {
      if (cmd === "ml_stdin") stdinArgs = args;
      return null;
    });

    await sendInfer(7, { input: "hi", maxNew: 50 });

    expect(stdinArgs).toEqual({ sid: 7, line: '{"input":"hi","maxNew":50}' });
  });

  it("spawnExport authorizes then runs `export --run <id>`", async () => {
    const order: string[] = [];
    let spawnArgs: unknown;
    invokeMock.mockImplementation(async (cmd: string, args?: unknown) => {
      order.push(cmd);
      if (cmd === "workspace_authorize") return "E:\\proj";
      if (cmd === "ml_spawn") {
        spawnArgs = args;
        return 9;
      }
      return null;
    });

    const sid = await spawnExport("nexis-ml", "E:\\proj", "2026-run");

    expect(sid).toBe(9);
    expect(order.indexOf("workspace_authorize")).toBeLessThan(
      order.indexOf("ml_spawn"),
    );
    expect(spawnArgs).toMatchObject({
      args: ["export", "--run", "2026-run"],
      projectDir: "E:\\proj",
    });
  });
});
