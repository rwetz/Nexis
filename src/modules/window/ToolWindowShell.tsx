// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { WindowControls } from "@/components/WindowControls";
import { WindowResizeEdges } from "@/components/WindowResizeEdges";
import { Icon } from "@/components/icon";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { IS_MAC, USE_CUSTOM_WINDOW_CONTROLS } from "@/lib/platform";
import { ThemeProvider } from "@/modules/theme";
import { AtlasWindowActions } from "@/modules/atlas/AtlasWindowActions";
import { lazy, Suspense } from "react";
import type { ToolWindowKind } from "./toolWindow";

const AtlasPanelLazy = lazy(() =>
  import("@/modules/atlas/AtlasPanel").then((module) => ({ default: module.AtlasPanel })),
);
const BenchmarkPanelLazy = lazy(() =>
  import("@/modules/benchmark/BenchmarkPanel").then((module) => ({ default: module.BenchmarkPanel })),
);

const TOOL_META = {
  atlas: { label: "Atlas", icon: "layers" },
  benchmark: { label: "Benchmark", icon: "activity" },
} as const;

/** A focused companion window for an app-level tool, without terminal chrome. */
export function ToolWindowShell({ kind }: { kind: ToolWindowKind }) {
  const meta = TOOL_META[kind];

  return (
    <ThemeProvider>
      <TooltipProvider>
        <div className="relative flex h-dvh flex-col overflow-hidden bg-background text-foreground">
          <WindowResizeEdges />
          <header
            data-tauri-drag-region
            className={`flex ${kind === "atlas" ? "h-14" : "h-10"} shrink-0 items-center gap-2 border-b border-border/60 bg-card px-3 select-none ${
              IS_MAC ? "pl-20" : ""
            }`}
          >
            <span className={kind === "atlas" ? "grid size-8 place-items-center rounded-lg bg-muted text-primary" : undefined}>
              <Icon name={meta.icon} size="md" className="text-muted-foreground" />
            </span>
            <span className="text-lg font-semibold tracking-tight">{meta.label}</span>
            {kind !== "atlas" && <span className="text-xs text-muted-foreground">Nexis</span>}
            <div data-tauri-drag-region className="min-w-2 flex-1" />
            {kind === "atlas" && <AtlasWindowActions />}
            {USE_CUSTOM_WINDOW_CONTROLS && <WindowControls />}
          </header>
          <main className="zoom-content nexis-scene-enter min-h-0 flex-1 overflow-hidden">
            <Suspense fallback={null}>
              {kind === "atlas" ? <AtlasPanelLazy standalone /> : <BenchmarkPanelLazy />}
            </Suspense>
          </main>
          <Toaster />
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );
}
