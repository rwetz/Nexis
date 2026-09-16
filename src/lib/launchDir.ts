// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { stripVerbatimPrefix } from "@/lib/path";
import { defineCommand } from "@/platform/ipc";
import { hostIpc } from "@/platform/tauri";

let cached: string | undefined;

export async function initLaunchDir(): Promise<void> {
  const dir = await hostIpc.call(
    defineCommand<Record<string, never>, string | null>("get_launch_dir", "host"),
    {},
  ).catch(() => null);
  cached = dir ? stripVerbatimPrefix(dir).replace(/\\/g, "/") : undefined;
}

export function getLaunchDir(): string | undefined {
  return cached;
}
