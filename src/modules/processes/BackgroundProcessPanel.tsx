import { cn } from "@/lib/utils";
import {
  Cancel01Icon,
  ComputerTerminalIcon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useBackgroundProcesses } from "./useBackgroundProcesses";

function relativeTime(ms: number): string {
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export function BackgroundProcessPanel() {
  const { processes, loading, refresh, kill } = useBackgroundProcesses(3000);
  const running = processes.filter((p) => !p.exited);
  const exited = processes.filter((p) => p.exited);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Processes
        </span>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          title="Refresh"
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          <HugeiconsIcon
            icon={RefreshIcon}
            size={12}
            strokeWidth={1.75}
            className={loading ? "animate-spin" : ""}
          />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {processes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
            <HugeiconsIcon
              icon={ComputerTerminalIcon}
              size={22}
              strokeWidth={1.25}
              className="text-muted-foreground/40"
            />
            <p className="text-[11px] text-muted-foreground">
              No background processes
            </p>
            <p className="max-w-48 text-[10.5px] text-muted-foreground/60">
              Processes spawned via{" "}
              <code className="rounded bg-muted px-0.5 font-mono">
                bash_background
              </code>{" "}
              appear here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-0">
            {running.length > 0 && (
              <div className="flex flex-col gap-0">
                <div className="px-3 py-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    Running ({running.length})
                  </span>
                </div>
                {running.map((p) => (
                  <ProcessRow key={p.handle} process={p} onKill={() => void kill(p.handle)} />
                ))}
              </div>
            )}
            {exited.length > 0 && (
              <div className="flex flex-col gap-0">
                <div className="px-3 py-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    Exited ({exited.length})
                  </span>
                </div>
                {exited.map((p) => (
                  <ProcessRow key={p.handle} process={p} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ProcessRow({
  process: p,
  onKill,
}: {
  process: ReturnType<typeof useBackgroundProcesses>["processes"][number];
  onKill?: () => void;
}) {
  return (
    <div className="group flex items-start gap-2 border-b border-border/30 px-3 py-2 hover:bg-muted/30">
      <div className="mt-0.5 flex shrink-0 items-center">
        {p.exited ? (
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              p.exit_code === 0 ? "bg-green-500/60" : "bg-destructive/60",
            )}
            title={`Exited ${p.exit_code ?? "?"}`}
          />
        ) : (
          <span
            className="h-2 w-2 animate-pulse rounded-full bg-primary/70"
            title="Running"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className="truncate font-mono text-[11px] text-foreground"
          title={p.command}
        >
          {p.command}
        </p>
        <p className="truncate text-[10px] text-muted-foreground" title={p.cwd ?? ""}>
          {p.cwd ?? "—"} · {relativeTime(p.started_at_ms)}
          {p.exited ? ` · exit ${p.exit_code ?? "?"}` : ""}
        </p>
      </div>
      {!p.exited && onKill && (
        <button
          type="button"
          onClick={onKill}
          title="Kill process"
          className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
