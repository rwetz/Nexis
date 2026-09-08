import { createContext, useContext, useEffect, useState } from "react";
import { flushSync } from "react-dom";

type Mode = "light" | "dark" | "system";
const STORAGE_KEY = "nexis-bench-ui-theme";

type ThemeCtx = {
  mode: Mode;
  resolvedMode: "light" | "dark";
  setMode: (m: Mode) => void;
  toggle: () => void;
};

const Ctx = createContext<ThemeCtx | null>(null);

function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<Mode>(
    () => (localStorage.getItem(STORAGE_KEY) as Mode) ?? "system",
  );

  const resolved: "light" | "dark" =
    mode === "system" ? (systemPrefersDark() ? "dark" : "light") : mode;

  const setMode = (m: Mode) => {
    const apply = () => {
      setModeState(m);
      localStorage.setItem(STORAGE_KEY, m);
    };
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => void;
    };
    if (
      doc.startViewTransition &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      doc.startViewTransition(() => flushSync(apply));
    } else {
      apply();
    }
  };

  const toggle = () => setMode(resolved === "dark" ? "light" : "dark");

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
    root.classList.toggle("light", resolved === "light");
    root.style.backgroundColor = resolved === "dark" ? "#0c0e10" : "#ffffff";
  }, [resolved]);

  return (
    <Ctx.Provider value={{ mode, resolvedMode: resolved, setMode, toggle }}>
      {children}
    </Ctx.Provider>
  );
}

export const useTheme = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
};
