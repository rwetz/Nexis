// Minimal theme engine for the Nexis design system (per SCAFFOLDING.md §7):
// mode (light|dark|system) + themeId, persisted to localStorage only. The
// View-Transition crossfade and applyTheme are kept verbatim from the blueprint.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { IS_LINUX } from "@/lib/platform";
import { applyTheme, clearTheme } from "./applyTheme";
import { getBuiltinTheme, getDefaultTheme } from "./themes";
import { DEFAULT_THEME_ID, type Theme } from "./types";

export type { Theme };
export type ThemeModePref = "light" | "dark" | "system";

/**
 * Run a theme-changing state update inside a View Transition so the whole
 * window crossfades between palettes instead of hard-cutting. flushSync makes
 * the React update synchronous so the browser captures the new palette in the
 * transition's "after" snapshot. Degrades to a plain update where the API is
 * unavailable or the user prefers reduced motion.
 *
 * Linux/WebKitGTK (2.52): startViewTransition exists but wedges or crashes
 * the web process when the snapshot repaints the whole window — hard cut
 * instead. Re-test when webkit2gtk ships a working implementation.
 */
function withViewTransition(mutate: () => void): void {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => unknown;
  };
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (IS_LINUX || reduce || typeof doc.startViewTransition !== "function") {
    mutate();
    return;
  }
  doc.startViewTransition(() => flushSync(mutate));
}

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultMode?: ThemeModePref;
};

type ThemeProviderState = {
  mode: ThemeModePref;
  resolvedMode: "dark" | "light";
  themeId: string;
  setMode: (mode: ThemeModePref) => void;
  setThemeId: (id: string) => void;
};

const ThemeProviderContext = createContext<ThemeProviderState | null>(null);

// Same keys index.html reads before the bundle loads (anti-flash fast path).
const FAST_PATH_KEY = "imagine-ui-theme-shadow";
const FAST_PATH_THEME_ID = "imagine-ui-theme-id-shadow";

function readMode(fallback: ThemeModePref): ThemeModePref {
  const v = window.localStorage.getItem(FAST_PATH_KEY);
  return v === "dark" || v === "light" || v === "system" ? v : fallback;
}

function writeMode(t: ThemeModePref): void {
  try { window.localStorage.setItem(FAST_PATH_KEY, t); } catch { /* ignore */ }
}

function readThemeId(): string {
  return window.localStorage.getItem(FAST_PATH_THEME_ID) ?? DEFAULT_THEME_ID;
}

function writeThemeId(id: string): void {
  try { window.localStorage.setItem(FAST_PATH_THEME_ID, id); } catch { /* ignore */ }
}

export function ThemeProvider({
  children,
  defaultMode = "system",
}: ThemeProviderProps) {
  const [mode, setModeState] = useState<ThemeModePref>(() => readMode(defaultMode));
  const [themeId, setThemeIdState] = useState<string>(() => readThemeId());
  const [systemDark, setSystemDark] = useState<boolean>(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

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
  }, [resolvedMode]);

  useEffect(() => {
    if (themeId === DEFAULT_THEME_ID) {
      clearTheme();
      return;
    }
    const theme = getBuiltinTheme(themeId) ?? getDefaultTheme();
    applyTheme(theme, resolvedMode);
  }, [themeId, resolvedMode]);

  const setMode = useCallback((next: ThemeModePref) => {
    withViewTransition(() => setModeState(next));
    writeMode(next);
  }, []);

  const setThemeId = useCallback((id: string) => {
    withViewTransition(() => setThemeIdState(id));
    writeThemeId(id);
  }, []);

  const value = useMemo<ThemeProviderState>(
    () => ({ mode, resolvedMode, themeId, setMode, setThemeId }),
    [mode, resolvedMode, themeId, setMode, setThemeId],
  );

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme(): ThemeProviderState {
  const ctx = useContext(ThemeProviderContext);
  if (!ctx) throw new Error("useTheme must be used within a <ThemeProvider>");
  return ctx;
}
