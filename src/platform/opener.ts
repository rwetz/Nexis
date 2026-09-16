import { revealItemInDir } from "@tauri-apps/plugin-opener";

/** Reveal is a host desktop operation; capabilities provide only the path. */
export function revealPathInHost(path: string): Promise<void> {
  return revealItemInDir(path);
}
