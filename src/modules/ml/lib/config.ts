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

type ReadResult =
  | { kind: "text"; content: string; size: number }
  | { kind: "binary"; size: number }
  | { kind: "toolarge"; size: number; limit: number };

export async function readTrainToml(projectDir: string): Promise<string | null> {
  try {
    const res = await invoke<ReadResult>("fs_read_file", {
      path: `${projectDir}/train.toml`,
      workspace: currentWorkspaceEnv(),
    });
    return res.kind === "text" ? res.content : null;
  } catch {
    return null;
  }
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
