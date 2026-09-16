// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { hostFilesystem } from "@/platform/filesystem";
import { hostAppConfigDir, joinHostPath } from "@/platform/paths";
import { emit, listen, type UnlistenFn } from "@/platform/events";
import type { Theme } from "./types";

const THEME_FILE_EXT = ".nexis-theme";
const THEME_EDIT_EVENT = "nexis://theme-edit";

export type ThemeEditRequest =
  | { action: "create" }
  | { action: "edit"; id: string };

async function themesDir(): Promise<string> {
  return joinHostPath(await hostAppConfigDir(), "themes");
}

export async function themeFilePath(id: string): Promise<string> {
  return joinHostPath(await themesDir(), `${id}${THEME_FILE_EXT}`);
}

export async function writeThemeFile(theme: Theme): Promise<string> {
  const dir = await themesDir();
  const dirExists = await hostFilesystem.stat(dir)
    .then(() => true)
    .catch(() => false);
  if (!dirExists) {
    await hostFilesystem.createDir(dir);
  }
  const path = await joinHostPath(dir, `${theme.id}${THEME_FILE_EXT}`);
  await hostFilesystem.writeFile(path, JSON.stringify(theme, null, 2), "theme");
  return path;
}

export async function deleteThemeFile(id: string): Promise<void> {
  try {
    const path = await themeFilePath(id);
    await hostFilesystem.delete(path);
  } catch {
    /* file may not exist yet — nothing to clean up */
  }
}

export function starterTheme(): Theme {
  const id = `my-theme-${crypto.randomUUID().slice(0, 8)}`;
  return {
    id,
    name: "My Theme",
    description: "Custom theme.",
    variants: {
      dark: {
        colors: {
          background: "#0d0d10",
          foreground: "#e8e8ea",
          card: "#15151a",
          cardForeground: "#e8e8ea",
          popover: "#15151a",
          popoverForeground: "#e8e8ea",
          primary: "#7dd3fc",
          primaryForeground: "#0d0d10",
          muted: "#1c1c22",
          mutedForeground: "#a0a0a8",
          accent: "#1c1c22",
          accentForeground: "#e8e8ea",
          border: "rgba(255,255,255,0.08)",
          input: "rgba(255,255,255,0.12)",
          ring: "#7dd3fc",
          sidebar: "#0a0a0d",
          sidebarForeground: "#e8e8ea",
          sidebarPrimary: "#7dd3fc",
          sidebarAccent: "#1c1c22",
          sidebarBorder: "rgba(255,255,255,0.08)",
          sidebarRing: "#7dd3fc",
        },
        terminal: {
          background: "#0d0d10",
          foreground: "#e8e8ea",
          cursor: "#e8e8ea",
          cursorAccent: "#0d0d10",
          selection: "rgba(125,211,252,0.22)",
        },
      },
    },
  };
}

export function emitThemeEdit(req: ThemeEditRequest): Promise<void> {
  return emit(THEME_EDIT_EVENT, req);
}

export function onThemeEdit(
  cb: (req: ThemeEditRequest) => void,
): Promise<UnlistenFn> {
  return listen<ThemeEditRequest>(THEME_EDIT_EVENT, (e) => cb(e.payload));
}
