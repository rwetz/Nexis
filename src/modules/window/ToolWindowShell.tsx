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
import { Suspense } from "react";
import type { ToolWindowContribution } from "@/workbench/capability";

/** A focused companion window for an app-level tool, without terminal chrome. */
export function ToolWindowShell({ tool }: { tool: ToolWindowContribution }) {
  const featured = tool.header === "featured";

  return (
    <ThemeProvider>
      <TooltipProvider>
        <div className="relative flex h-dvh flex-col overflow-hidden bg-background text-foreground">
          <WindowResizeEdges />
          <header
            data-tauri-drag-region
            className={`flex ${featured ? "h-14" : "h-10"} shrink-0 items-center gap-2 border-b border-border/60 bg-card px-3 select-none ${
              IS_MAC ? "pl-20" : ""
            }`}
          >
            <span className={featured ? "grid size-8 place-items-center rounded-lg bg-muted text-primary" : undefined}>
              <Icon name={tool.icon} size="md" className="text-muted-foreground" />
            </span>
            <span className="text-lg font-semibold tracking-tight">{tool.label}</span>
            {!featured && <span className="text-xs text-muted-foreground">Nexis</span>}
            <div data-tauri-drag-region className="min-w-2 flex-1" />
            {tool.renderActions?.()}
            {USE_CUSTOM_WINDOW_CONTROLS && <WindowControls />}
          </header>
          <main className="zoom-content nexis-scene-enter min-h-0 flex-1 overflow-hidden">
            <Suspense fallback={null}>
              {tool.render()}
            </Suspense>
          </main>
          <Toaster />
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );
}
