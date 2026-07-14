// Kill orphaned `pnpm tauri dev` processes — cross-platform dispatcher.
//
// Ctrl+C usually only stops the foreground `tauri` process, not the Vite,
// cargo, and nexis children it spawned. Those orphans keep holding port 1420
// (Vite) and the src-tauri/target build lock, so the next `pnpm tauri dev`
// fails with "Port 1420 is already in use" and "Blocking waiting for file
// lock on artifact directory".
//
// Windows keeps the original PowerShell implementation (kill-dev.ps1); Unix
// uses pgrep/lsof. Both only target processes whose command line references
// this project's dev toolchain, so editors, language servers, and unrelated
// node apps are left alone.

import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

if (process.platform === "win32") {
  const r = spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(here, "kill-dev.ps1")],
    { stdio: "inherit" },
  );
  process.exit(r.status ?? 1);
}

// ── Unix ────────────────────────────────────────────────────────────────────

/** Run a command, returning stdout ("" on non-zero exit). */
function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: "utf8" });
  } catch {
    return "";
  }
}

// Candidate PIDs: node/cargo/rustc/nexis processes mentioning the dev toolchain.
const patterns = ["tauri dev", "vite", "nexis"];
const pids = new Set();
for (const pat of patterns) {
  for (const line of run("pgrep", ["-af", pat]).split("\n")) {
    const m = line.match(/^(\d+)\s+(.*)$/);
    if (!m) continue;
    const [, pid, cmdline] = m;
    // Only the project's toolchain — and never this script itself.
    if (Number(pid) === process.pid) continue;
    if (/node|cargo|rustc|nexis|vite/.test(cmdline) && !cmdline.includes("kill-dev")) {
      pids.add(Number(pid));
    }
  }
}

if (pids.size === 0) {
  console.log("No orphaned tauri dev processes found.");
} else {
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
      console.log(`Killed ${pid}`);
    } catch {
      console.log(`Skipped ${pid} (already gone)`);
    }
  }
}

// Port check: anything still listening on 1420 is not ours — flag it.
const lsof = run("lsof", ["-ti", ":1420", "-sTCP:LISTEN"]).trim();
if (lsof) {
  console.warn(`Port 1420 still in use by PID ${lsof} — not a tauri dev process; investigate manually.`);
  process.exit(1);
}
console.log("Port 1420: FREE — safe to run pnpm tauri dev.");
