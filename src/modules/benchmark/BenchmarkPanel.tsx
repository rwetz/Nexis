// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Benchmark as a Nexis sidebar view.
 *
 * The standalone app's `App.tsx` and `Header.tsx`, minus everything Nexis
 * already provides: the `ThemeProvider` and its light/dark toggle, the
 * `TooltipProvider`, the `Toaster`, `WindowControls`, the drag region, the
 * brand mark, and the "preview" badge that marked a browser session. The
 * heptagram watermark goes too — inside Nexis it is another app's logo sitting
 * behind Nexis's own UI.
 *
 * The layout is rotated for the shape of the space it now lives in. As an app
 * it was a 340px configuration rail beside a wide results canvas. A sidebar
 * panel is *all* rail, so configuration and results stack vertically and the
 * results half gets whatever is left — which is also why the run bar is pinned
 * rather than sitting at the bottom of a scrolling column.
 */

import { useEffect } from "react";
import { Icon } from "@/components/icon";

import { BackendSelector } from "@/modules/benchmark/backends/BackendSelector";
import { ConfigPanel } from "@/modules/benchmark/config/ConfigPanel";
import { ModelLibrary } from "@/modules/benchmark/library/ModelLibrary";
import { ResultsDashboard } from "@/modules/benchmark/results/ResultsDashboard";
import { RunBar } from "@/modules/benchmark/run/RunBar";
import { useBenchStore } from "@/modules/benchmark/store";

export function BenchmarkPanel() {
  const init = useBenchStore((s) => s.init);
  const running = useBenchStore((s) => s.running);
  const onKeyDown = useScopedKeys();

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div
      className="flex h-full flex-col outline-none"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border/40 px-2">
        <span className="text-xs font-medium">Benchmark</span>
        {running && (
          <span className="flex items-center gap-1 text-[10px] text-brand">
            <Icon name="loading" size="xs" className="nexis-spin" />
            running
          </span>
        )}
        <div className="flex-1" />
      </header>

      {/* Configuration: what to run, on what, how many times. */}
      <div className="nexis-scrollbar flex shrink-0 flex-col gap-2 overflow-y-auto p-2"
           style={{ maxHeight: "45%" }}>
        <ModelLibrary />
        <BackendSelector />
        <ConfigPanel />
      </div>

      <div className="shrink-0 border-y border-border/40 p-2">
        <RunBar />
      </div>

      {/* Results take the remainder. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ResultsDashboard />
      </div>
    </div>
  );
}

/**
 * Cmd/Ctrl+Enter runs, Escape stops.
 *
 * Scoped to this subtree, not `window`. The standalone app also bound a bare
 * `t` to toggle the theme; that is gone twice over — Nexis owns theming, and a
 * bare letter key on `window` would fight the terminal for every keystroke.
 */
function useScopedKeys() {
  return (e: React.KeyboardEvent<HTMLDivElement>) => {
    const s = useBenchStore.getState();
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (!s.running) void s.startRun();
    } else if (e.key === "Escape" && s.running) {
      e.preventDefault();
      void s.cancelRun();
    }
  };
}

export default BenchmarkPanel;
