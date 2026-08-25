// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { invoke } from "@tauri-apps/api/core";
import { stripVerbatimPrefix } from "@/lib/path";

let cached: string | undefined;

export async function initLaunchDir(): Promise<void> {
  const dir = await invoke<string | null>("get_launch_dir").catch(() => null);
  cached = dir ? stripVerbatimPrefix(dir).replace(/\\/g, "/") : undefined;
}

export function getLaunchDir(): string | undefined {
  return cached;
}
