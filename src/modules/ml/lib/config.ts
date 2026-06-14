// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Read/write a project's train.toml for the hyperparameter form. Writes
 * go through the atomic fs_write_file command (tmp + rename), so a save
 * can't leave a half-written config a concurrent `train` might read.
 */
import { invoke } from "@tauri-apps/api/core";
import { currentWorkspaceEnv } from "@/modules/workspace";
import { readTextFile } from "./fs";

export function readTrainToml(projectDir: string): Promise<string | null> {
  return readTextFile(`${projectDir}/train.toml`);
}

export async function writeTrainToml(
  projectDir: string,
  content: string,
): Promise<void> {
  await invoke("fs_write_file", {
    path: `${projectDir}/train.toml`,
    content,
    workspace: currentWorkspaceEnv(),
    source: "ml-lab",
  });
}
