import { useEffect } from "react";
import { useBenchStore } from "@/store/useBenchStore";
import { useTheme } from "@/modules/theme/ThemeProvider";

/**
 * Global keyboard shortcuts:
 *  - ⌘/Ctrl + Enter → run benchmark
 *  - Esc            → stop a running benchmark
 *  - t              → toggle theme (when not typing)
 */
export function useShortcuts() {
  const { toggle } = useTheme();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing =
        !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      const s = useBenchStore.getState();
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (!s.running) void s.startRun();
      } else if (e.key === "Escape") {
        if (s.running) void s.cancelRun();
      } else if (!typing && (e.key === "t" || e.key === "T")) {
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);
}
