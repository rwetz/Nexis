import { git } from "@/capabilities/git/api";
import { processes as processNative } from "@/platform/processes";
// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { GitSubmoduleEntry } from "@/domain/native-types";
import { useCallback, useEffect, useState } from "react";

type Props = {
  repoRoot: string;
};

function statusBadge(
  status: GitSubmoduleEntry["status"],
): { label: string; cls: string } {
  switch (status) {
    case "modified":
      return {
        label: "modified",
        cls: "bg-warning/20 text-warning",
      };
    case "uninitialized":
      return {
        label: "not init",
        cls: "bg-muted/60 text-muted-foreground",
      };
    case "conflict":
      return {
        label: "conflict",
        cls: "bg-destructive/15 text-destructive",
      };
    default:
      return {
        label: "ok",
        cls: "bg-success/15 text-success",
      };
  }
}

export function SubmoduleSection({ repoRoot }: Props) {
  const [submodules, setSubmodules] = useState<GitSubmoduleEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [busyUpdate, setBusyUpdate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!repoRoot) return;
    setLoading(true);
    try {
      const entries = await git.gitSubmoduleStatus(repoRoot);
      setSubmodules(entries);
    } catch (e) {
      // `submodule_status` already maps a missing .gitmodules to an empty list
      // (it returns Ok(vec![]) on a non-zero exit), so nothing that reaches
      // here is the ordinary "no submodules" case — it is a real failure.
      setSubmodules([]);
      setError(typeof e === "string" ? e : "Failed to load submodules");
    } finally {
      setLoading(false);
    }
  }, [repoRoot]);

  // Load on mount rather than on expand. The guard below hides the whole
  // section when the repo has no submodules, so that decision needs the list
  // *before* the user can interact with anything — and gating the fetch on
  // `expanded` deadlocked it: the section rendered null, so the toggle that
  // sets `expanded` never existed, so the list never loaded, so it kept
  // rendering null. The section was unreachable in every repo.
  useEffect(() => {
    void load();
  }, [load]);

  if (!loading && submodules.length === 0 && !expanded) return null;

  return (
    <div className="border-t border-border/40">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex h-7 w-full items-center gap-2 px-3 text-left text-caption font-medium text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground"
      >
        <Icon
          name="chevron-down"
          size="xs"
          className={cn( "shrink-0 transition-transform", expanded ? "rotate-0" : "-rotate-90", )}
        />
        <Icon name="git-branch" className="shrink-0" />
        <span>Submodules</span>
        {submodules.length > 0 && (
          <span className="ml-auto rounded-sm bg-muted/55 px-1 py-px text-micro tabular-nums text-muted-foreground">
            {submodules.length}
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-2 pb-2 pt-1">
          <div className="mb-1.5 flex items-center gap-1">
            <Button
              size="xs"
              variant="ghost"
              className="ml-auto h-6 cursor-pointer text-caption text-muted-foreground"
              onClick={() => void load()}
            >
              {loading ? <Spinner className="size-2.5" /> : "Refresh"}
            </Button>
          </div>

          {error && (
            <div className="mb-1 rounded bg-destructive/10 px-2 py-1 text-caption text-destructive">
              {error}
            </div>
          )}

          {loading && submodules.length === 0 ? (
            <div className="flex items-center gap-2 py-2 text-caption text-muted-foreground">
              <Spinner className="size-3" />
              Loading submodules…
            </div>
          ) : submodules.length === 0 ? (
            <div className="py-2 text-caption text-muted-foreground/65">
              No submodules found.
            </div>
          ) : (
            <ul className="space-y-px">
              {submodules.map((entry) => {
                const badge = statusBadge(entry.status);
                const isBusy = busyUpdate === entry.path;
                return (
                  <li
                    key={entry.path}
                    className="group flex items-center gap-1.5 rounded-md px-1.5 py-1 text-caption hover:bg-accent/30"
                  >
                    <Icon
                      name="git-branch"
                      size="xs"
                      className="shrink-0 text-muted-foreground/60"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium leading-tight text-foreground/90">
                          {entry.name}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-sm px-1 py-px text-micro font-medium",
                            badge.cls,
                          )}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-micro text-muted-foreground/65">
                        <span className="truncate">{entry.path}</span>
                        <span>·</span>
                        <span className="shrink-0 font-mono">
                          {entry.sha.slice(0, 7)}
                        </span>
                      </div>
                    </div>
                    {isBusy ? (
                      <Spinner className="size-2.5 shrink-0" />
                    ) : (
                      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        {entry.status === "uninitialized" ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                aria-label="Init submodule"
                                onClick={() => {
                                  setBusyUpdate(entry.path);
                                  setError(null);
                                  processNative
                                    .runCommand(
                                      "git submodule init -- " +
                                        JSON.stringify(entry.path),
                                      repoRoot,
                                    )
                                    .then(() => load())
                                    .catch((e: unknown) =>
                                      setError(
                                        typeof e === "string" ? e : "Init failed",
                                      ),
                                    )
                                    .finally(() => setBusyUpdate(null));
                                }}
                                className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                              >
                                <Icon name="git-pr" size="xs" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-caption">
                              Init submodule
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                aria-label="Update submodule"
                                onClick={() => {
                                  setBusyUpdate(entry.path);
                                  setError(null);
                                  processNative
                                    .runCommand(
                                      "git submodule update -- " +
                                        JSON.stringify(entry.path),
                                      repoRoot,
                                    )
                                    .then(() => load())
                                    .catch((e: unknown) =>
                                      setError(
                                        typeof e === "string"
                                          ? e
                                          : "Update failed",
                                      ),
                                    )
                                    .finally(() => setBusyUpdate(null));
                                }}
                                className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                              >
                                <Icon name="loading" size="xs" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-caption">
                              Update submodule
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
