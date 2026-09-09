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
  const models = useBenchStore((s) => s.models);
  const selectedModelIds = useBenchStore((s) => s.selectedModelIds);
  const selectedBackendIds = useBenchStore((s) => s.selectedBackendIds);
  const onKeyDown = useScopedKeys();

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div
      className="@container flex h-full flex-col bg-background outline-none"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <header className="shrink-0 border-b border-border/60 bg-card/40 px-4 py-4 @4xl:px-6 @4xl:py-5">
        <div className="mx-auto flex w-full max-w-[1700px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <Icon name="activity" size="md" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-muted-foreground">
                Local model performance
              </div>
              <h1 className="truncate text-base font-semibold tracking-tight @4xl:text-lg">
                Benchmark workspace
              </h1>
            </div>
          </div>
          <div className="hidden items-center gap-2 text-xs text-muted-foreground @md:flex">
            {running ? (
              <>
                <Icon name="loading" size="sm" className="nexis-spin text-primary" />
                <span>Benchmark running</span>
              </>
            ) : (
              <>
                <span className="font-mono tabular-nums">{selectedModelIds.length}</span>
                <span>models</span>
                <span className="text-border">/</span>
                <span className="font-mono tabular-nums">{selectedBackendIds.length}</span>
                <span>backends</span>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="nexis-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1700px] flex-col gap-4 p-3 @4xl:gap-5 @4xl:p-6">
          <section className="flex flex-col gap-3">
            <div className="flex items-end justify-between gap-3 px-1">
              <div>
                <h2 className="text-sm font-semibold">Set up a comparison</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Choose the models, engines, and workload you want to measure.
                </p>
              </div>
              <span className="hidden rounded-full border border-border bg-muted/40 px-2.5 py-1 font-mono text-[10px] text-muted-foreground tabular-nums @2xl:block">
                {models.length} in library
              </span>
            </div>
            <div className="nexis-stagger grid gap-3 @4xl:grid-cols-[minmax(20rem,1.3fr)_minmax(18rem,1fr)_minmax(18rem,1fr)] @4xl:items-stretch">
              <ModelLibrary />
              <BackendSelector />
              <ConfigPanel />
            </div>
          </section>

          <RunBar />

          <div className="min-h-[18rem] flex-1 overflow-hidden rounded-2xl border border-border/70 bg-card/35 @4xl:min-h-[24rem]">
            <ResultsDashboard />
          </div>
        </div>
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
