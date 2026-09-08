import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Clock01Icon, Delete02Icon, HugeiconsIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useBenchStore } from "@/store/useBenchStore";

export function HistoryMenu() {
  const history = useBenchStore((s) => s.history);
  const currentId = useBenchStore((s) => s.run?.id);
  const running = useBenchStore((s) => s.running);
  const loadRun = useBenchStore((s) => s.loadRun);
  const deleteRun = useBenchStore((s) => s.deleteRun);
  const clearHistory = useBenchStore((s) => s.clearHistory);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        className="rounded-md"
        disabled={history.length === 0}
        onClick={() => setOpen((o) => !o)}
      >
        <HugeiconsIcon icon={Clock01Icon} size={15} strokeWidth={1.8} />
        History
        <span className="font-mono text-[11px] text-muted-foreground">{history.length}</span>
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1.5 w-80 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
            <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Run history
              </span>
              <button
                onClick={() => {
                  clearHistory();
                  setOpen(false);
                }}
                className="text-[11px] text-muted-foreground hover:text-destructive"
              >
                Clear all
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto nexis-scrollbar p-1.5">
              {history.map((h) => {
                const done = h.results.filter((r) => r.status === "done").length;
                return (
                  <div
                    key={h.id}
                    className={cn(
                      "group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors",
                      h.id === currentId ? "bg-brand/10" : "hover:bg-muted",
                    )}
                  >
                    <button
                      disabled={running}
                      onClick={() => {
                        loadRun(h.id);
                        setOpen(false);
                      }}
                      className="flex min-w-0 flex-1 flex-col text-left disabled:opacity-50"
                    >
                      <span className="truncate text-[12px] font-medium">
                        {new Date(h.createdAt).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {done}/{h.matrix.length} cells · {h.config.task} · {h.config.runs}×
                      </span>
                    </button>
                    <button
                      onClick={() => deleteRun(h.id)}
                      aria-label="Delete run"
                      className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    >
                      <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.8} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
