// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DEFAULT_THEME_ID,
  EDITOR_THEMES,
  loadPreferences,
  onPreferencesChange,
  setEditorTheme as persistEditorTheme,
  setTheme as persistTheme,
  setThemeId as persistThemeId,
  type EditorThemeId,
  type ThemePref,
} from "@/modules/settings/store";
import { flushSync } from "react-dom";
import { IS_LINUX } from "@/lib/platform";
import { applyTheme, clearTheme } from "./applyTheme";

/**
 * Run a theme-changing state update inside a View Transition so the whole
 * window crossfades between palettes instead of hard-cutting. flushSync makes
 * the React update synchronous so the browser captures the new palette in the
 * transition's "after" snapshot. Degrades to a plain update where the API is
 * unavailable or the user prefers reduced motion.
 *
 * Disabled entirely on Linux: the webview there is WebKitGTK, whose view-
 * transition path captures a full-page GPU snapshot to composite the crossfade.
 * On the NVIDIA proprietary driver that snapshot crashes the WebKit web process
 * (silent renderer death — no Rust panic, so nothing in the crash dir), taking
 * the window down on every theme switch. The crossfade is cosmetic, so Linux
 * falls back to an instant swap. Related: lib.rs tune_linux_webkit.
 */
function withViewTransition(mutate: () => void): void {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => unknown;
  };
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || IS_LINUX || typeof doc.startViewTransition !== "function") {
    mutate();
    return;
  }
  doc.startViewTransition(() => flushSync(mutate));
}
import {
  listCustomThemes,
  onCustomThemesChange,
} from "./customThemes";
import { RainbowDefs } from "./RainbowDefs";
import { installRainbowAccent } from "./rainbowAccent";
import { SurfaceLayer } from "./SurfaceLayer";
import { getBuiltinTheme, getDefaultTheme, migrateThemeId } from "./themes";
import type { Theme } from "./types";

export type { Theme };
export type ThemeModePref = ThemePref;

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultMode?: ThemePref;
};

type ThemeProviderState = {
  mode: ThemePref;
  resolvedMode: "dark" | "light";
  themeId: string;
  customThemes: Theme[];
  /**
   * Bumped once the theme's CSS variables are actually on the document.
   *
   * For anything styled in CSS this is redundant — the cascade handles it. It
   * exists for consumers that have to read colours *back out* through a
   * computed-style probe because their rendering target cannot see custom
   * properties at all: a `<canvas>` (the Atlas map), and anything drawing to
   * one. Those consumers cannot key off `themeId` alone, because the id
   * changes during the render that requests the new theme while the variables
   * only land in the effect below — probing on the id gives you the *previous*
   * palette, once, and it stays wrong until something else re-renders.
   */
  paletteEpoch: number;
  setMode: (mode: ThemePref) => void;
  setThemeId: (id: string) => void;
};

const ThemeProviderContext = createContext<ThemeProviderState | null>(null);

const FAST_PATH_KEY = "nexis-ui-theme-shadow";
const FAST_PATH_THEME_ID = "nexis-ui-theme-id-shadow";

function readFastMode(fallback: ThemePref): ThemePref {
  if (typeof window === "undefined") return fallback;
  const v = window.localStorage.getItem(FAST_PATH_KEY);
  return v === "dark" || v === "light" || v === "system" ? v : fallback;
}

function writeFastMode(t: ThemePref): void {
  try { window.localStorage.setItem(FAST_PATH_KEY, t); } catch { /* ignore */ }
}

function readFastThemeId(): string {
  if (typeof window === "undefined") return DEFAULT_THEME_ID;
  return migrateThemeId(
    window.localStorage.getItem(FAST_PATH_THEME_ID) ?? DEFAULT_THEME_ID,
  );
}

function writeFastThemeId(id: string): void {
  try { window.localStorage.setItem(FAST_PATH_THEME_ID, id); } catch { /* ignore */ }
}

function resolveTheme(id: string, custom: Theme[]): Theme {
  return custom.find((t) => t.id === id) ?? getBuiltinTheme(id) ?? getDefaultTheme();
}

export function ThemeProvider({ children, defaultMode = "system" }: ThemeProviderProps) {
  const [mode, setModeState] = useState<ThemePref>(() => readFastMode(defaultMode));
  const [themeId, setThemeIdState] = useState<string>(() => readFastThemeId());
  const [customThemes, setCustomThemes] = useState<Theme[]>([]);
  const [rainbowAccent, setRainbowAccentState] = useState(true);
  const [systemDark, setSystemDark] = useState<boolean>(() =>
    typeof window === "undefined"
      ? true
      : window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    let alive = true;
    void loadPreferences().then((p) => {
      if (!alive) return;
      const id = migrateThemeId(p.themeId);
      setModeState(p.theme);
      setThemeIdState(id);
      setRainbowAccentState(p.rainbowAccent);
      writeFastMode(p.theme);
      writeFastThemeId(id);
      // Write the migration back so it happens once, not on every launch.
      if (id !== p.themeId) void persistThemeId(id);
    });
    const unlistenP = onPreferencesChange((key, value) => {
      if (key === "theme" && (value === "system" || value === "light" || value === "dark")) {
        setModeState(value);
        writeFastMode(value);
      } else if (key === "themeId" && typeof value === "string") {
        const id = migrateThemeId(value);
        setThemeIdState(id);
        writeFastThemeId(id);
      } else if (key === "rainbowAccent" && typeof value === "boolean") {
        setRainbowAccentState(value);
      }
    });
    return () => {
      alive = false;
      void unlistenP.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    let alive = true;
    void listCustomThemes().then((list) => { if (alive) setCustomThemes(list); });
    const unlisten = onCustomThemesChange(() => {
      void listCustomThemes().then((list) => setCustomThemes(list));
    });
    return () => {
      alive = false;
      void unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolvedMode: "dark" | "light" =
    mode === "system" ? (systemDark ? "dark" : "light") : mode;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolvedMode);
    setPaletteEpoch((n) => n + 1);
  }, [resolvedMode]);

  // See `paletteEpoch` on ThemeProviderState.
  const [paletteEpoch, setPaletteEpoch] = useState(0);

  const lastEditorPairRef = useRef<string | null>(null);
  useEffect(() => {
    if (themeId === DEFAULT_THEME_ID) {
      clearTheme();
      lastEditorPairRef.current = null;
      setPaletteEpoch((n) => n + 1);
      return;
    }
    const theme = resolveTheme(themeId, customThemes);
    applyTheme(theme, resolvedMode);
    // Strictly after applyTheme: the whole point of the epoch is that a probe
    // reading on it sees the variables this effect just wrote.
    setPaletteEpoch((n) => n + 1);
    const editorPair = theme.editorTheme?.[resolvedMode];
    if (
      editorPair &&
      lastEditorPairRef.current !== editorPair &&
      (EDITOR_THEMES as readonly string[]).includes(editorPair)
    ) {
      lastEditorPairRef.current = editorPair;
      void persistEditorTheme(editorPair as EditorThemeId);
    }
  }, [themeId, resolvedMode, customThemes]);

  // Only the default theme has a rainbow accent, and only when the preference
  // is on. Gating the *install* rather than only the CSS means a disabled
  // setting costs nothing: no listener, no paint servers, no attributes.
  const rainbowActive = rainbowAccent && themeId === DEFAULT_THEME_ID;
  useEffect(() => {
    const root = document.documentElement;
    if (!rainbowActive) {
      root.removeAttribute("data-rainbow-accent");
      return;
    }
    // One flag for every rainbow. The hover gradients need the listener anyway,
    // but the aurora border is pure CSS, so it needs a signal it can select on.
    root.setAttribute("data-rainbow-accent", "");
    const stop = installRainbowAccent();
    return () => {
      root.removeAttribute("data-rainbow-accent");
      stop();
    };
  }, [rainbowActive]);

  const setMode = useCallback((next: ThemePref) => {
    withViewTransition(() => setModeState(next));
    writeFastMode(next);
    void persistTheme(next);
  }, []);

  const setThemeId = useCallback((id: string) => {
    withViewTransition(() => setThemeIdState(id));
    writeFastThemeId(id);
    void persistThemeId(id);
  }, []);

  const value = useMemo<ThemeProviderState>(
    () => ({
      mode,
      resolvedMode,
      themeId,
      customThemes,
      paletteEpoch,
      setMode,
      setThemeId,
    }),
    [mode, resolvedMode, themeId, customThemes, paletteEpoch, setMode, setThemeId],
  );

  return (
    <ThemeProviderContext.Provider value={value}>
      <SurfaceLayer />
      {rainbowActive ? <RainbowDefs /> : null}
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme(): ThemeProviderState {
  const ctx = useContext(ThemeProviderContext);
  if (!ctx) throw new Error("useTheme must be used within a <ThemeProvider>");
  return ctx;
}
