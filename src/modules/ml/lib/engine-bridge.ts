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

/**
 * Path where a downloaded standalone engine lives (under the app's local
 * data dir), to add to the detection candidates. Resolved by the Rust side
 * so the platform-specific name (`nexis-ml` vs `nexis-ml.exe`) and base dir
 * are authoritative. Returns null if the path can't be resolved.
 */
export function managedEngineCandidate(): Promise<string | null> {
  return invoke<string>("ml_managed_engine_path").catch(() => null);
}

/**
 * The GitHub release download URL for the standalone engine binary matching
 * this OS/arch, or null on a platform with no prebuilt binary. Resolved by
 * the Rust side (it knows the target triple).
 */
export function engineReleaseUrl(): Promise<string | null> {
  return invoke<string | null>("ml_engine_release_url").catch(() => null);
}

/**
 * Download a standalone `nexis-ml` engine binary from `url` (https) into the
 * managed dir and verify it — the "no Python on this machine" install path,
 * mirroring how an LSP server is fetched. Resolves to the installed engine's
 * path + version (usable exactly like a detected engine).
 */
export function downloadEngine(url: string): Promise<EngineDetectResult> {
  return invoke<EngineDetectResult>("ml_download", { url });
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
export type MlTemplate = "tabular" | "textgen" | "image" | "blank";

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

export type InstallFlavor = "default" | "cuda-torch" | "git";

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
  /**
   * Rust standalone engine only: its compute backend (`"cpu"` | `"wgpu"`).
   * The Python engine never reports it — its presence is how we tell the
   * two engines apart (see `engineKindFromEnv`).
   */
  backend: string | null;
  /**
   * Capability flag: the engine implements `serve` (the Playground's
   * inference loop). The Rust engine reports it from v0.8; the Python
   * engine has always had serve but never reports the flag — so gate with
   * `kind !== "rust" || serve` (see the panel's Playground gate).
   */
  serve: boolean;
};

/**
 * Ask the engine what it can do (`nexis-ml env`). Slow-ish — importing
 * torch takes a few seconds on the Python engine — so callers fire it
 * without blocking UI. The Rust engine answers instantly.
 */
export async function probeEnv(exe: string): Promise<MlEnvInfo> {
  const raw = await invoke<string>("ml_env", { exe });
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return {
    python: typeof parsed.python === "string" ? parsed.python : null,
    torch: typeof parsed.torch === "string" ? parsed.torch : null,
    cudaAvailable: parsed.cudaAvailable === true,
    gpuName: typeof parsed.gpuName === "string" ? parsed.gpuName : null,
    backend: typeof parsed.backend === "string" ? parsed.backend : null,
    serve: parsed.serve === true,
  };
}

/** Which engine binary is in use. The two engines share the name
 *  `nexis-ml` but have different capability sets (ML_LAB_GUIDE §22). */
export type EngineKind = "python" | "rust";

/**
 * Identify the engine from its `env` report. The Rust engine reports a
 * `backend` field and no torch; the Python engine reports python/torch.
 * Returns null when we can't tell yet (probe not done or failed) — callers
 * treat that as "don't block", letting the engine surface its own error.
 */
export function engineKindFromEnv(env: MlEnvInfo | null): EngineKind | null {
  if (!env) return null;
  if (env.backend != null) return "rust";
  if (env.python != null || env.torch != null) return "python";
  return null;
}

/** Templates the standalone Rust engine can scaffold. The Python engine
 *  supports every template; textgen and the code-it-yourself `blank`
 *  project need Python (the Rust engine is config-only — ML_LAB_GUIDE §22). */
const RUST_TEMPLATES: readonly MlTemplate[] = ["tabular", "image"];

/**
 * Whether `template` can be scaffolded by the given engine. An unknown
 * engine kind (probe pending/failed) is treated as supported — the engine
 * still validates and reports its own error if it genuinely can't.
 */
export function engineSupportsTemplate(
  template: MlTemplate,
  kind: EngineKind | null,
): boolean {
  if (kind !== "rust") return true;
  return RUST_TEMPLATES.includes(template);
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

/** Write a run's self-contained HTML report (`nexis-ml export --run`).
 *  Python engine only — the Rust engine's `export` speaks `--onnx` instead.
 *  One-shot: completion arrives as ml:exit; the file lands at
 *  <run>/report.html. */
export async function spawnExport(
  exe: string,
  projectDir: string,
  runId: string,
): Promise<number> {
  await authorizeProjectDir(projectDir);
  return invoke<number>("ml_spawn", {
    exe,
    args: ["export", "--run", runId],
    projectDir,
  });
}

/** Export the project's tabular model to ONNX (`nexis-ml export --onnx .`).
 *  Rust engine only. Retrains from train.toml (reproducible via [train]
 *  seed) and writes <project>/model.onnx. One-shot: completion arrives as
 *  ml:exit. */
export async function spawnExportOnnx(
  exe: string,
  projectDir: string,
): Promise<number> {
  await authorizeProjectDir(projectDir);
  return invoke<number>("ml_spawn", {
    exe,
    args: ["export", "--onnx", "."],
    projectDir,
  });
}

/** Graceful stop: the engine checkpoints and finishes as "cancelled". */
export function cancelRun(sid: number): Promise<void> {
  return invoke("ml_cancel", { sid });
}

/** Pause/resume a training run — the harness honors it at the next epoch
 *  boundary. Sent as a control line on the child's stdin. */
export function sendControl(sid: number, cmd: "pause" | "resume"): Promise<void> {
  return invoke("ml_stdin", { sid, line: JSON.stringify({ cmd }) });
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
