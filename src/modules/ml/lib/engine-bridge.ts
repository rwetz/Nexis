// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Bridge to the external `nexis-ml` engine (see ML_SUITE.md).
 *
 * Spawning goes through the Rust `ml_*` commands which stream protocol
 * events back as Tauri events. Two CLAUDE.md pitfalls are load-bearing
 * here:
 *
 *  - #1C: `workspace_authorize` is called on the project dir BEFORE
 *    `ml_spawn`, exactly like pty-bridge does before pty_open. Skipping
 *    it makes the spawn fail with "outside authorized roots".
 *  - #10: the detection promise is memoized in a Map; the `.catch()`
 *    deletes the entry before re-throwing so a failed probe is retried
 *    on the next call instead of being cached forever.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { currentWorkspaceEnv } from "@/modules/workspace";

export type EngineDetectResult = { exe: string; version: string };

export type ProtoPayload = { sid: number; lines: string[] };
export type StderrPayload = { sid: number; line: string };
export type ExitPayload = { sid: number; code: number | null };

export type PythonEnvLike = { python_path: string };

// ── Detection ─────────────────────────────────────────────────────────────────

/**
 * `.../Scripts/python.exe` → `.../Scripts/nexis-ml.exe` (or bin/ on
 * unix). The env's own layout tells us the flavor — a `.exe` python
 * means a Windows-layout env regardless of anything else.
 */
export function siblingExe(pythonPath: string): string | null {
  const normalized = pythonPath.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  if (idx < 0) return null;
  const dir = pythonPath.slice(0, idx + 1);
  const isWindowsLayout = /\.exe$/i.test(pythonPath);
  return isWindowsLayout ? `${dir}nexis-ml.exe` : `${dir}nexis-ml`;
}

/**
 * Probe paths for `.venv`/`venv` in the workspace root and its ancestors.
 * py_detect_envs only sees envs inside the workspace, but a project like
 * `repo/scratch/demo` is typically served by `repo/.venv` — without the
 * ancestor walk the engine shows "missing" despite being installed.
 * Nonexistent candidates fail the --version probe instantly, so a few
 * extra entries are free.
 */
export function ancestorVenvCandidates(workspaceRoot: string): string[] {
  const out: string[] = [];
  let dir = workspaceRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  for (let depth = 0; depth < 6 && dir; depth++) {
    for (const venv of [".venv", "venv"]) {
      out.push(`${dir}/${venv}/Scripts/nexis-ml.exe`);
      out.push(`${dir}/${venv}/bin/nexis-ml`);
    }
    const idx = dir.lastIndexOf("/");
    if (idx <= 2) break; // reached a drive root ("E:") or unix shallow path
    dir = dir.slice(0, idx);
  }
  return out;
}

/**
 * Candidate executables, most specific first: every detected Python
 * env's scripts dir, then `.venv`s up the directory tree, then bare
 * `nexis-ml` from PATH.
 */
export function buildCandidates(
  envs: PythonEnvLike[],
  workspaceRoot?: string | null,
): string[] {
  const out: string[] = [];
  for (const env of envs) {
    const exe = siblingExe(env.python_path);
    if (exe && !out.includes(exe)) out.push(exe);
  }
  if (workspaceRoot) {
    for (const exe of ancestorVenvCandidates(workspaceRoot)) {
      if (!out.includes(exe)) out.push(exe);
    }
  }
  out.push("nexis-ml");
  return out;
}

const detectCache = new Map<string, Promise<EngineDetectResult>>();

export function detectEngine(
  candidates: string[],
): Promise<EngineDetectResult> {
  const key = candidates.join("|");
  let p = detectCache.get(key);
  if (!p) {
    p = invoke<EngineDetectResult>("ml_detect", { candidates }).catch(
      (err) => {
        // Pitfall #10: never leave a rejected promise in the cache.
        detectCache.delete(key);
        throw err;
      },
    );
    detectCache.set(key, p);
  }
  return p;
}

/** Drop all memoized detections (the panel's "re-detect" button). */
export function resetEngineDetection(): void {
  detectCache.clear();
}

// ── Spawning ──────────────────────────────────────────────────────────────────

async function authorizeProjectDir(projectDir: string): Promise<void> {
  // Pitfall #1C: authorize before any spawn with a user-supplied cwd.
  // Failure is swallowed like pty-bridge does — if the dir is genuinely
  // inaccessible, ml_spawn returns its own descriptive error.
  try {
    await invoke<string>("workspace_authorize", {
      path: projectDir,
      workspace: currentWorkspaceEnv(),
    });
  } catch (err) {
    console.warn("[nexis] ml workspace_authorize failed:", err);
  }
}

/** Spawn `nexis-ml train` in the project dir. Resolves to a session id. */
export async function spawnTrain(
  exe: string,
  projectDir: string,
): Promise<number> {
  await authorizeProjectDir(projectDir);
  return invoke<number>("ml_spawn", {
    exe,
    args: ["train", "."],
    projectDir,
  });
}

/** Project templates the panel can scaffold. The engine validates the
 *  name too (argparse `choices`); this union keeps the UI honest. */
export type MlTemplate = "tabular" | "textgen" | "image";

/**
 * Scaffold a new project under the workspace root (`nexis-ml new
 * <template> <name>`). One-shot: completion arrives as ml:exit.
 */
export async function spawnNew(
  exe: string,
  workspaceRoot: string,
  template: MlTemplate,
  name: string,
): Promise<number> {
  await authorizeProjectDir(workspaceRoot);
  return invoke<number>("ml_spawn", {
    exe,
    args: ["new", template, name],
    projectDir: workspaceRoot,
  });
}

export type InstallFlavor = "default" | "cuda-torch";

/**
 * Install/upgrade the engine (or a torch variant) into a Python env.
 * Output streams as ml:stderr lines, completion as ml:exit. Flavors
 * are a fixed allowlist on the Rust side.
 */
export function spawnInstall(
  python: string,
  flavor: InstallFlavor,
): Promise<number> {
  return invoke<number>("ml_install", { python, flavor });
}

export type MlEnvInfo = {
  python: string | null;
  torch: string | null;
  cudaAvailable: boolean;
  gpuName: string | null;
};

/**
 * Ask the engine what it can do (`nexis-ml env`). Slow-ish — importing
 * torch takes a few seconds — so callers fire it without blocking UI.
 */
export async function probeEnv(exe: string): Promise<MlEnvInfo> {
  const raw = await invoke<string>("ml_env", { exe });
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return {
    python: typeof parsed.python === "string" ? parsed.python : null,
    torch: typeof parsed.torch === "string" ? parsed.torch : null,
    cudaAvailable: parsed.cudaAvailable === true,
    gpuName: typeof parsed.gpuName === "string" ? parsed.gpuName : null,
  };
}

/** NVIDIA GPU name from the driver (nvidia-smi), engine not required. */
export function probeGpu(): Promise<string | null> {
  return invoke<string | null>("ml_gpu_probe");
}

/** Replay a finished run's event log (frontend dev / demo tool). */
export async function spawnReplay(
  exe: string,
  projectDir: string,
  runPath: string,
): Promise<number> {
  await authorizeProjectDir(projectDir);
  return invoke<number>("ml_spawn", {
    exe,
    args: ["replay", runPath, "--delay", "5"],
    projectDir,
  });
}

/**
 * Start an inference session (`nexis-ml serve --run <id>`) for the
 * playground. Long-lived like train; requests go in via `sendInfer`,
 * responses stream back as ml:proto serve events. Resolves to a sid.
 */
export async function spawnServe(
  exe: string,
  projectDir: string,
  runId: string,
  checkpoint: "best" | "last" = "best",
): Promise<number> {
  await authorizeProjectDir(projectDir);
  return invoke<number>("ml_spawn", {
    exe,
    args: ["serve", "--run", runId, "--checkpoint", checkpoint],
    projectDir,
  });
}

/** Send one inference request to a serve session (written as a single
 *  stdin line; the engine answers with a prediction/error event). */
export function sendInfer(sid: number, request: unknown): Promise<void> {
  return invoke("ml_stdin", { sid, line: JSON.stringify(request) });
}

/** Graceful stop: the engine checkpoints and finishes as "cancelled". */
export function cancelRun(sid: number): Promise<void> {
  return invoke("ml_cancel", { sid });
}

/** Hard kill, for when cancel doesn't take. */
export function killRun(sid: number): Promise<void> {
  return invoke("ml_kill", { sid });
}

// ── Event subscription ────────────────────────────────────────────────────────

export type MlBridgeHandlers = {
  onProto: (payload: ProtoPayload) => void;
  onStderr: (payload: StderrPayload) => void;
  onExit: (payload: ExitPayload) => void;
};

/**
 * Subscribe to the engine event stream. Returns a dispose function.
 * Batched upstream in Rust (~30 Hz), so handlers run at human rates
 * even when training emits thousands of metric lines per second.
 */
export function subscribeMlEvents(handlers: MlBridgeHandlers): () => void {
  const unlisteners: Promise<UnlistenFn>[] = [
    listen<ProtoPayload>("ml:proto", (e) => handlers.onProto(e.payload)),
    listen<StderrPayload>("ml:stderr", (e) => handlers.onStderr(e.payload)),
    listen<ExitPayload>("ml:exit", (e) => handlers.onExit(e.payload)),
  ];
  return () => {
    for (const p of unlisteners) {
      void p.then((un) => un()).catch(() => {});
    }
  };
}
