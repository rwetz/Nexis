import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { openConfig } from "@/modules/repos/api";
import { useAtlasStore } from "@/modules/repos/store";
import { dirtyCount, formatBytes, formatCount } from "@/modules/repos/types";
import { Settings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";

/** One bar for both views. The left half changes with the mode — the list
 *  counts repos by git state, the map counts files and bytes — because those
 *  are the numbers each view is actually about. */
export function StatusBar() {
  const repos = useAtlasStore((s) => s.repos);
  const mode = useAtlasStore((s) => s.mode);
  const mapView = useAtlasStore((s) => s.mapView);
  const city = useAtlasStore((s) => s.city);
  const scanning = useAtlasStore((s) => s.scanning);
  const cityLoading = useAtlasStore((s) => s.cityLoading);
  const elapsedMs = useAtlasStore((s) => s.elapsedMs);
  const configPath = useAtlasStore((s) => s.configPath);

  const timing = scanning
    ? "scanning…"
    : mode === "map" && cityLoading
      ? "reading repo…"
      : mode === "map" && mapView === "city" && city
        ? `built in ${city.elapsed_ms} ms`
        : elapsedMs !== null
          ? `scanned in ${elapsedMs} ms`
          : "";

  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-border/60 bg-card px-3 text-xs text-muted-foreground select-none">
      {mode === "list" ? <ListSummary /> : <MapSummary />}
      <span className="tabular-nums text-muted-foreground/60">{timing}</span>

      <span className="flex-1" />

      <span className="hidden text-muted-foreground/60 lg:block">
        {mode === "list"
          ? "j/k navigate · ↵ details · v map · r refresh · t terminal · o folder"
          : "drag pan · wheel zoom · dbl-click enter · q/e rotate · f fit · l labels · v list"}
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

  function ListSummary() {
    const dirty = repos.filter((r) => dirtyCount(r) > 0).length;
    const ahead = repos.filter((r) => r.ahead > 0).length;
    const behind = repos.filter((r) => r.behind > 0).length;
    const errors = repos.filter((r) => r.error).length;

    return (
      <span className="tabular-nums">
        {repos.length} repos
        {dirty > 0 && (
          <>
            {" · "}
            <span className="text-amber-400">{dirty} dirty</span>
          </>
        )}
        {ahead > 0 && (
          <>
            {" · "}
            <span className="text-sky-400">{ahead} ahead</span>
          </>
        )}
        {behind > 0 && (
          <>
            {" · "}
            <span className="text-orange-400">{behind} behind</span>
          </>
        )}
        {errors > 0 && (
          <>
            {" · "}
            <span className="text-destructive">{errors} errors</span>
          </>
        )}
      </span>
    );
  }

  function MapSummary() {
    const inCity = mapView === "city" && city;
    const summary = inCity
      ? `${formatCount(city.summary.files)} files · ${formatCount(city.root.lines)} lines · ${formatBytes(city.summary.bytes)}`
      : `${repos.length} repos · ${formatCount(repos.reduce((s, r) => s + r.files, 0))} files · ${formatBytes(repos.reduce((s, r) => s + r.bytes, 0))}`;

    const dirty = inCity
      ? dirtyCount(city.summary)
      : repos.filter((r) => dirtyCount(r) > 0).length;
    const dirtyLabel = inCity ? `${dirty} changed files` : `${dirty} dirty repos`;

    return (
      <span className="tabular-nums">
        {summary}
        {dirty > 0 && (
          <>
            {" · "}
            <span className="text-[var(--brand)]">{dirtyLabel}</span>
          </>
        )}
      </span>
    );
  }
}
