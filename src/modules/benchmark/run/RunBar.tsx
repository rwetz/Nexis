import { cn } from "@/lib/utils";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { useBenchStore } from "@/modules/benchmark/store";

export function RunBar() {
  const running = useBenchStore((s) => s.running);
  const startRun = useBenchStore((s) => s.startRun);
  const cancelRun = useBenchStore((s) => s.cancelRun);
  const selectedModels = useBenchStore((s) => s.selectedModelIds);
  const selectedBackends = useBenchStore((s) => s.selectedBackendIds);
  // Recompute planned cells from the live selection.
  const plannedMatrix = useBenchStore((s) => s.plannedMatrix);
  useBenchStore((s) => s.selectedModelIds);
  useBenchStore((s) => s.selectedBackendIds);
  const cells = plannedMatrix();

  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/[0.045] p-3.5 @3xl:flex-row @3xl:items-center @3xl:justify-between @3xl:px-4",
        running && "nexis-run-live",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon name={running ? "loading" : "play"} size="sm" className={running ? "nexis-spin" : undefined} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">{running ? "Benchmark in progress" : "Ready to run"}</div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {cells.length > 0
              ? `${selectedModels.length} model${selectedModels.length === 1 ? "" : "s"} × ${selectedBackends.length} selected engine${selectedBackends.length === 1 ? "" : "s"} · ${cells.length} compatible cell${cells.length === 1 ? "" : "s"}`
              : "Choose a model and a compatible engine to create a run plan."}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className="hidden font-mono text-[11px] text-muted-foreground tabular-nums @md:inline">
          {cells.length} cell{cells.length === 1 ? "" : "s"}
        </span>
        {running ? (
        <Button
          variant="destructive"
          size="sm"
          onClick={() => void cancelRun()}
          className="min-w-28"
          title="Esc"
        >
          <Icon name="stop" size="md" />
          Stop
        </Button>
      ) : (
        <Button
          variant="brand"
          size="sm"
          onClick={() => void startRun()}
          disabled={cells.length === 0}
          className="min-w-36"
          title="⌘/Ctrl + Enter"
        >
          <Icon name="play" size="sm" />
          Run benchmark
        </Button>
        )}
      </div>
    </section>
  );
}
