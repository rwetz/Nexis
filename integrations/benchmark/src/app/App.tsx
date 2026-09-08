import { useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Heptagram } from "@/components/Heptagram";
import { Header } from "@/modules/header/Header";
import { ModelLibrary } from "@/modules/library/ModelLibrary";
import { BackendSelector } from "@/modules/backends/BackendSelector";
import { ConfigPanel } from "@/modules/config/ConfigPanel";
import { RunBar } from "@/modules/run/RunBar";
import { ResultsDashboard } from "@/modules/results/ResultsDashboard";
import { ThemeProvider } from "@/modules/theme/ThemeProvider";
import { useShortcuts } from "@/modules/window/useShortcuts";
import { useBenchStore } from "@/store/useBenchStore";

export default function App() {
  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={0}>
        <Shell />
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}

function Shell() {
  const init = useBenchStore((s) => s.init);
  useShortcuts();
  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <Header />
      <main className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside className="flex w-[340px] shrink-0 flex-col border-r border-border/60 bg-sidebar">
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 nexis-scrollbar">
            <ModelLibrary />
            <BackendSelector />
            <ConfigPanel />
          </div>
          <div className="border-t border-border/60 p-3">
            <RunBar />
          </div>
        </aside>

        {/* Results */}
        <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <Heptagram className="pointer-events-none absolute top-1/2 left-1/2 size-[640px] -translate-x-1/2 -translate-y-1/2 text-foreground opacity-[0.05]" />
          <div className="relative z-10 flex min-h-0 flex-1 flex-col">
            <ResultsDashboard />
          </div>
        </section>
      </main>
    </div>
  );
}
