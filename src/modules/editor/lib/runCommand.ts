// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { IS_WINDOWS } from "@/lib/platform";

// On Windows, `python` is typically not in PATH. The Python Launcher (`py`)
// ships with the official Python installer and is the reliable cross-version
// entry point. On macOS/Linux, `python3` is the standard name.
const PYTHON_CMD = IS_WINDOWS ? "py" : "python3";

const EXT_COMMANDS: Record<string, (file: string) => string> = {
  py: (f) => `${PYTHON_CMD} "${f}"`,
  js: (f) => `node "${f}"`,
  mjs: (f) => `node "${f}"`,
  cjs: (f) => `node "${f}"`,
  ts: (f) => `npx tsx "${f}"`,
  tsx: (f) => `npx tsx "${f}"`,
  mts: (f) => `npx tsx "${f}"`,
  rb: (f) => `ruby "${f}"`,
  php: (f) => `php "${f}"`,
  pl: (f) => `perl "${f}"`,
  lua: (f) => `lua "${f}"`,
  r: (f) => `Rscript "${f}"`,
  go: (f) => `go run "${f}"`,
  sh: (f) => `bash "${f}"`,
  bash: (f) => `bash "${f}"`,
  zsh: (f) => `zsh "${f}"`,
  fish: (f) => `fish "${f}"`,
  ps1: (f) => `pwsh -File "${f}"`,
};

const BASENAME_COMMANDS: Record<string, (dir: string) => string> = {
  Makefile: () => "make",
  makefile: () => "make",
  GNUmakefile: () => "make",
};

export type RunCommand = {
  command: string;
  cwd: string;
};

export function buildRunCommand(path: string): RunCommand | null {
  const normalized = path.replace(/\\/g, "/");
  const basename = normalized.split("/").pop() ?? "";
  const dir = normalized.slice(0, normalized.lastIndexOf("/")) || ".";
  const ext = basename.includes(".") ? basename.split(".").pop()!.toLowerCase() : "";
  const filename = basename;

  const byBasename = BASENAME_COMMANDS[filename];
  if (byBasename) return { command: byBasename(dir) + "\n", cwd: dir };

  const byExt = EXT_COMMANDS[ext];
  if (byExt) return { command: byExt(filename) + "\n", cwd: dir };

  return null;
}
