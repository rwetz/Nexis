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

const { languageIds, fileExtensions, fileNames } = Object.entries(
  fileIcons,
).reduce<{
  languageIds: Record<string, string>;
  fileExtensions: Record<string, string>;
  fileNames: Record<string, string>;
}>(
  ({ languageIds, fileExtensions, fileNames }, [name, icon]) => ({
    languageIds: {
      ...languageIds,
      ...icon.languageIds?.reduce<Record<string, string>>(
        (a, c) => ({ ...a, [c]: name }),
        {},
      ),
    },
    fileExtensions: {
      ...fileExtensions,
      ...icon.fileExtensions?.reduce<Record<string, string>>(
        (a, c) => ({ ...a, [c]: name }),
        {},
      ),
    },
    fileNames: {
      ...fileNames,
      ...icon.fileNames?.reduce<Record<string, string>>(
        (a, c) => ({ ...a, [c]: name }),
        {},
      ),
    },
  }),
  { languageIds: {}, fileExtensions: {}, fileNames: {} },
);

export { fileExtensions, fileNames, languageIds };
