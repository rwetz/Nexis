import { Button } from "@/components/ui/button";
import { HugeiconsIcon, Loading03Icon, PlayIcon, StopIcon } from "@/components/icons";
import { useBenchStore } from "@/store/useBenchStore";

export function RunBar() {
  const running = useBenchStore((s) => s.running);
  const startRun = useBenchStore((s) => s.startRun);
  const cancelRun = useBenchStore((s) => s.cancelRun);
  // Recompute planned cells from the live selection.
  const plannedMatrix = useBenchStore((s) => s.plannedMatrix);
  useBenchStore((s) => s.selectedModelIds);
  useBenchStore((s) => s.selectedBackendIds);
  const cells = plannedMatrix();

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Run plan
        </span>
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
          {cells.length} cell{cells.length === 1 ? "" : "s"}
        </span>
      </div>

      {running ? (
        <Button
          variant="destructive"
          size="lg"
          onClick={() => void cancelRun()}
          className="w-full"
          title="Esc"
        >
          <HugeiconsIcon icon={StopIcon} size={16} strokeWidth={2} />
          Stop
        </Button>
      ) : (
        <Button
          variant="brand"
          size="lg"
          onClick={() => void startRun()}
          disabled={cells.length === 0}
          className="w-full"
          title="⌘/Ctrl + Enter"
        >
          <HugeiconsIcon
            icon={cells.length === 0 ? Loading03Icon : PlayIcon}
            size={16}
            strokeWidth={2}
          />
          Run benchmark
        </Button>
      )}
      {cells.length === 0 && (
        <p className="text-center text-[10.5px] text-muted-foreground">
          Select at least one model and a compatible backend.
        </p>
      )}
    </div>
  );
}
