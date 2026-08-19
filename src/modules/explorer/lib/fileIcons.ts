// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * File icon associations — data lives in fileIcons.json.
 * This module builds the three lookup maps used by iconResolver.ts.
 */
import rawFileIcons from "./fileIcons.json";

type FileIconEntry = {
  languageIds?: string[];
  fileExtensions?: string[];
  fileNames?: string[];
};

export type FileIcons = Record<string, FileIconEntry>;

export const fileIcons = rawFileIcons as FileIcons;

// Built with a plain loop rather than a spreading `reduce`: every spread of
// the accumulator copied the whole growing map, which is O(n^2) over roughly a
// thousand icon entries and runs at module load, before the first frame.
const languageIds: Record<string, string> = {};
const fileExtensions: Record<string, string> = {};
const fileNames: Record<string, string> = {};

for (const [name, icon] of Object.entries(fileIcons)) {
  for (const id of icon.languageIds ?? []) languageIds[id] = name;
  for (const ext of icon.fileExtensions ?? []) fileExtensions[ext] = name;
  for (const file of icon.fileNames ?? []) fileNames[file] = name;
}

export { fileExtensions, fileNames, languageIds };
