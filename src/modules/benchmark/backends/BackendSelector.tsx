import { Icon } from "@/components/icon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BACKEND_COLOR } from "@/modules/benchmark/lib/backendMeta";
import { pickLlamaBench } from "@/modules/benchmark/lib/api";
import { cn } from "@/lib/utils";
import { type BackendInfo } from "@/modules/benchmark/lib/types";
import { useBenchStore } from "@/modules/benchmark/store";

export function BackendSelector() {
  const backends = useBenchStore((s) => s.backends);
  const selected = useBenchStore((s) => s.selectedBackendIds);
  const toggleBackend = useBenchStore((s) => s.toggleBackend);
  const setLlamaBench = useBenchStore((s) => s.setLlamaBench);

  const locateLlama = async () => {
    const path = await pickLlamaBench();
    if (path) await setLlamaBench(path);
  };

  return (
    <Card size="sm" className="rounded-2xl border border-border/70 bg-card/80 shadow-none">
      <CardHeader className="pb-0">
        <div>
          <CardTitle className="text-sm">Engines</CardTitle>
          <p className="mt-0.5 text-[11px] text-muted-foreground">The runtimes to measure</p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        {backends.map((b) => (
          <BackendRow
            key={b.id}
            backend={b}
            selected={selected.includes(b.id)}
            onToggle={() => b.available && toggleBackend(b.id)}
            action={
              b.id === "llama" ? (
                <button
                  onClick={locateLlama}
                  className="shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium text-brand hover:bg-brand/10"
                >
                  {b.available ? "Change" : "Locate…"}
                </button>
              ) : null
            }
          />
        ))}
      </CardContent>
    </Card>
  );
}

function BackendRow({
  backend,
  selected,
  onToggle,
  action,
}: {
  backend: BackendInfo;
  selected: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
}) {
  const disabled = !backend.available;
  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors",
        !disabled && selected
          ? "border-primary/30 bg-primary/5"
          : "border-transparent bg-muted/30 hover:bg-muted",
      )}
    >
      <button
        onClick={onToggle}
        disabled={disabled}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5 text-left",
          disabled && "cursor-not-allowed opacity-55",
        )}
      >
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{
            backgroundColor: selected ? BACKEND_COLOR[backend.id] : "transparent",
            boxShadow: selected
              ? `0 0 0 1px ${BACKEND_COLOR[backend.id]}`
              : "inset 0 0 0 1.5px var(--border)",
          }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-medium leading-tight">{backend.label}</span>
            {backend.version && (
              <span className="font-mono text-[10px] text-muted-foreground">v{backend.version}</span>
            )}
            <span className="rounded bg-muted px-1 py-px text-[9.5px] font-semibold uppercase text-muted-foreground">
              {backend.device}
            </span>
          </div>
          <div className="mt-0.5 text-[10.5px] text-muted-foreground line-clamp-1 group-hover:line-clamp-none">
            {backend.description}
          </div>
        </div>
      </button>
      {action}
      {disabled && !action && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="shrink-0 text-muted-foreground">
              <Icon name="alert" size="sm" />
            </span>
          </TooltipTrigger>
          <TooltipContent>Not available on this machine</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
