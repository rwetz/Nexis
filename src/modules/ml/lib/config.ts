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
import { filesystem } from "@/platform/filesystem";
import { readTextFile } from "./fs";

export function readTrainToml(projectDir: string): Promise<string | null> {
  return readTextFile(`${projectDir}/train.toml`);
}

export async function writeTrainToml(
  projectDir: string,
  content: string,
): Promise<void> {
  await filesystem.writeFile(`${projectDir}/train.toml`, content, "ml-lab");
}

/** Preserve the human reason a project exists next to its engine config.
 * This is a separate file so it never risks making train.toml invalid for an
 * engine that only understands its own schema. */
export async function writeProjectBrief(projectDir: string, purpose: string): Promise<void> {
  const text = purpose.trim();
  if (!text) return;
  await filesystem.writeFile(
    `${projectDir}/PROJECT.md`,
    `# Training brief\n\n${text}\n`,
    "ml-lab",
  );
}
