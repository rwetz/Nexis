import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Settings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";
import { openConfig } from "./api";
import { useCityStore } from "./store";
import { dirtyCount, formatBytes, formatCount } from "./types";

export function StatusBar() {
  const repos = useCityStore((s) => s.repos);
  const view = useCityStore((s) => s.view);
  const city = useCityStore((s) => s.city);
  const scanning = useCityStore((s) => s.scanning);
  const cityLoading = useCityStore((s) => s.cityLoading);
  const elapsedMs = useCityStore((s) => s.elapsedMs);
  const configPath = useCityStore((s) => s.configPath);

  const summary =
    view === "city" && city
      ? `${formatCount(city.summary.files)} files · ${formatCount(city.root.lines)} lines · ${formatBytes(city.summary.bytes)}`
      : `${repos.length} repos · ${formatCount(repos.reduce((s, r) => s + r.files, 0))} files · ${formatBytes(repos.reduce((s, r) => s + r.bytes, 0))}`;

  const dirty =
    view === "city" && city
      ? dirtyCount(city.summary)
      : repos.filter((r) => dirtyCount(r) > 0).length;
  const dirtyLabel =
    view === "city" ? `${dirty} changed files` : `${dirty} dirty repos`;

  const timing = scanning
    ? "scanning…"
    : cityLoading
      ? "reading repo…"
      : view === "city" && city
        ? `built in ${city.elapsed_ms} ms`
        : elapsedMs !== null
          ? `scanned in ${elapsedMs} ms`
          : "";

  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-border/60 bg-card px-3 text-xs text-muted-foreground select-none">
      <span className="tabular-nums">
        {summary}
        {dirty > 0 && (
          <>
            {" · "}
            <span className="text-[var(--brand)]">{dirtyLabel}</span>
          </>
        )}
      </span>
      <span className="tabular-nums text-muted-foreground/60">{timing}</span>

      <span className="flex-1" />

      <span className="hidden text-muted-foreground/60 lg:block">
        drag pan · wheel zoom · dbl-click enter · q/e rotate · f fit · l labels
      </span>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Open config.toml"
            onClick={() =>
              openConfig().catch((e) =>
                toast.error("Could not open config", { description: String(e) }),
              )
            }
          >
            <HugeiconsIcon icon={Settings01Icon} size={13} strokeWidth={2} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">{configPath ?? "config.toml"}</TooltipContent>
      </Tooltip>
    </footer>
  );
}
