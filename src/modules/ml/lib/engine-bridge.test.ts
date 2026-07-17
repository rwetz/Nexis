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
  downloadEngine,
  engineInstallPin,
  engineKindFromEnv,
  engineSupportsTemplate,
  installLocalEngine,
  managedEngineCandidate,
  managedEngineStatus,
  uninstallEngine,
  probeEnv,
  resetEngineDetection,
  sendInfer,
  siblingExe,
  spawnExport,
  spawnNew,
  spawnServe,
  spawnTrain,
  type MlEnvInfo,
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

describe("engine kind + template gating", () => {
  const env = (over: Partial<MlEnvInfo>): MlEnvInfo => ({
    python: null,
    torch: null,
    cudaAvailable: false,
    gpuName: null,
    backend: null,
    serve: false,
    ...over,
  });

  it("identifies the Rust engine by its `backend` field", () => {
    expect(engineKindFromEnv(env({ backend: "wgpu" }))).toBe("rust");
    expect(engineKindFromEnv(env({ backend: "cpu" }))).toBe("rust");
  });

  it("identifies the Python engine by python/torch", () => {
    expect(engineKindFromEnv(env({ python: "/x/python", torch: "2.3" }))).toBe(
      "python",
    );
    expect(engineKindFromEnv(env({ torch: "2.3" }))).toBe("python");
  });

  it("is null when the kind can't be told yet", () => {
    expect(engineKindFromEnv(null)).toBeNull();
    expect(engineKindFromEnv(env({}))).toBeNull();
  });

  it("blocks textgen/blank on the Rust engine but allows tabular/image", () => {
    expect(engineSupportsTemplate("textgen", "rust")).toBe(false);
    expect(engineSupportsTemplate("blank", "rust")).toBe(false);
    expect(engineSupportsTemplate("tabular", "rust")).toBe(true);
    expect(engineSupportsTemplate("image", "rust")).toBe(true);
  });

  it("allows every template on the Python engine or when kind is unknown", () => {
    for (const kind of ["python", null] as const) {
      expect(engineSupportsTemplate("textgen", kind)).toBe(true);
      expect(engineSupportsTemplate("blank", kind)).toBe(true);
    }
  });

  it("probeEnv parses the Rust engine's backend field", async () => {
    invokeMock.mockResolvedValueOnce(JSON.stringify({ backend: "wgpu" }));
    const info = await probeEnv("nexis-ml");
    expect(info.backend).toBe("wgpu");
    expect(engineKindFromEnv(info)).toBe("rust");
  });

  it("probeEnv parses the serve capability flag (Rust engine v0.8+)", async () => {
    // A v0.8 engine reports serve: true → the Playground gate opens.
    invokeMock.mockResolvedValueOnce(
      JSON.stringify({ backend: "cpu", serve: true }),
    );
    expect((await probeEnv("nexis-ml")).serve).toBe(true);
    // Older engines don't report the field at all → false, gate stays shut.
    invokeMock.mockResolvedValueOnce(JSON.stringify({ backend: "cpu" }));
    expect((await probeEnv("nexis-ml")).serve).toBe(false);
    // Anything non-boolean-true is false (defensive).
    invokeMock.mockResolvedValueOnce(
      JSON.stringify({ backend: "cpu", serve: "yes" }),
    );
    expect((await probeEnv("nexis-ml")).serve).toBe(false);
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

  it("managedEngineCandidate returns the Rust-resolved path", async () => {
    invokeMock.mockImplementation(async (cmd: string) =>
      cmd === "ml_managed_engine_path" ? "C:\\data\\engine\\nexis-ml.exe" : null,
    );
    expect(await managedEngineCandidate()).toBe("C:\\data\\engine\\nexis-ml.exe");
  });

  it("managedEngineCandidate resolves null when the path can't be resolved", async () => {
    invokeMock.mockImplementation(async () => {
      throw new Error("no data dir");
    });
    expect(await managedEngineCandidate()).toBeNull();
  });

  it("downloadEngine invokes ml_download with no URL — the pin owns it", async () => {
    // The download URL and checksum are compiled into the Rust pin; the
    // frontend must not be able to point the installer anywhere else.
    let args: unknown = "unset";
    invokeMock.mockImplementation(async (cmd: string, a?: unknown) => {
      if (cmd === "ml_download") {
        args = a;
        return { exe: "C:\\data\\engine\\nexis-ml.exe", version: "0.8.0" };
      }
      return null;
    });

    const res = await downloadEngine();

    expect(args).toBeUndefined();
    expect(res).toEqual({
      exe: "C:\\data\\engine\\nexis-ml.exe",
      version: "0.8.0",
    });
  });

  it("engineInstallPin returns the pin and resolves null on error", async () => {
    const pin = {
      version: "0.8.0",
      url: "https://github.com/rwetz/nexis-ml-rs/releases/download/v0.8.0/nexis-ml-linux-x64",
      sizeBytes: 26113824,
      sha256: "18a4981b476e639cfd4cc6722f4eea4686612568253c59a3f3591a63ba8bc5e9",
    };
    invokeMock.mockImplementation(async (cmd: string) =>
      cmd === "ml_engine_pin" ? pin : null,
    );
    expect(await engineInstallPin()).toEqual(pin);

    invokeMock.mockImplementation(async () => {
      throw new Error("boom");
    });
    expect(await engineInstallPin()).toBeNull();
  });

  it("installLocalEngine passes the file path to ml_install_local", async () => {
    let args: unknown;
    invokeMock.mockImplementation(async (cmd: string, a?: unknown) => {
      if (cmd === "ml_install_local") {
        args = a;
        return { exe: "/data/engine/nexis-ml", version: "0.8.0" };
      }
      return null;
    });
    await installLocalEngine("/tmp/nexis-ml-linux-x64");
    expect(args).toEqual({ path: "/tmp/nexis-ml-linux-x64" });
  });

  it("managedEngineStatus and uninstallEngine hit their commands", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "ml_engine_status")
        return { installed: true, path: "/data/engine/nexis-ml", sizeBytes: 42 };
      if (cmd === "ml_uninstall") return 42;
      return null;
    });
    expect(await managedEngineStatus()).toMatchObject({ installed: true });
    expect(await uninstallEngine()).toBe(42);
  });
});
