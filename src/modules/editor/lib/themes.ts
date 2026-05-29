import type { Extension } from "@codemirror/state";
import type { EditorThemeId } from "@/modules/settings/store";

type ThemeLoader = () => Promise<Extension>;

const THEME_LOADERS: Record<EditorThemeId, ThemeLoader> = {
  atomone: () => import("@uiw/codemirror-theme-atomone").then((m) => m.atomone),
  aura: () => import("@uiw/codemirror-theme-aura").then((m) => m.aura),
  copilot: () => import("@uiw/codemirror-theme-copilot").then((m) => m.copilot),
  "github-dark": () => import("@uiw/codemirror-theme-github").then((m) => m.githubDark),
  "github-light": () => import("@uiw/codemirror-theme-github").then((m) => m.githubLight),
  nord: () => import("@uiw/codemirror-theme-nord").then((m) => m.nord),
  "tokyo-night": () => import("@uiw/codemirror-theme-tokyo-night").then((m) => m.tokyoNight),
  "xcode-dark": () => import("@uiw/codemirror-theme-xcode").then((m) => m.xcodeDark),
  "xcode-light": () => import("@uiw/codemirror-theme-xcode").then((m) => m.xcodeLight),
};

const themeCache = new Map<EditorThemeId, Extension>();

export async function loadEditorTheme(id: EditorThemeId): Promise<Extension> {
  const cached = themeCache.get(id);
  if (cached) return cached;
  const ext = await THEME_LOADERS[id]();
  themeCache.set(id, ext);
  return ext;
}

export function getCachedEditorTheme(id: EditorThemeId): Extension | null {
  return themeCache.get(id) ?? null;
}
