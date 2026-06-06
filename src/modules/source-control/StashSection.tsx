// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { native, type GitStashEntry } from "@/modules/ai/lib/native";
import {
  Archive01Icon,
  ArrowDown01Icon,
  Delete02Icon,
  GitBranchIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  repoRoot: string;
  onStashApplied?: () => void;
};

function relativeTime(secs: number): string {
  if (!secs) return "";
  const diff = Date.now() / 1000 - secs;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function StashSection({ repoRoot, onStashApplied }: Props) {
  const [stashes, setStashes] = useState<GitStashEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pushMessage, setPushMessage] = useState("");
  const [showPushInput, setShowPushInput] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!repoRoot) return;
    setLoading(true);
    try {
      const entries = await native.gitStashList(repoRoot);
      setStashes(entries);
    } catch {
      // Not a stash error, just no stash list — ignore
    } finally {
      setLoading(false);
    }
  }, [repoRoot]);

  useEffect(() => {
    if (expanded) void load();
  }, [expanded, load]);

  useEffect(() => {
    if (showPushInput) requestAnimationFrame(() => inputRef.current?.focus());
  }, [showPushInput]);

  const handlePush = async () => {
    setBusy("push");
    setError(null);
    try {
      await native.gitStashPush(repoRoot, pushMessage.trim() || undefined);
      setPushMessage("");
      setShowPushInput(false);
      await load();
      onStashApplied?.();
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to create stash");
    } finally {
      setBusy(null);
    }
  };

  const handleApply = async (entry: GitStashEntry) => {
    setBusy(entry.refName);
    setError(null);
    try {
      await native.gitStashApply(repoRoot, entry.refName);
      onStashApplied?.();
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to apply stash");
    } finally {
      setBusy(null);
    }
  };

  const handlePop = async (entry: GitStashEntry) => {
    setBusy(entry.refName);
    setError(null);
    try {
      await native.gitStashPop(repoRoot, entry.refName);
      await load();
      onStashApplied?.();
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to pop stash");
    } finally {
      setBusy(null);
    }
  };

  const handleDrop = async (entry: GitStashEntry) => {
    setBusy(entry.refName);
    setError(null);
    try {
      await native.gitStashDrop(repoRoot, entry.refName);
      await load();
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to drop stash");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="border-t border-border/40">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex h-7 w-full items-center gap-2 px-3 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground"
      >
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={10}
          strokeWidth={2}
          className={cn(
            "shrink-0 transition-transform",
            expanded ? "rotate-0" : "-rotate-90",
          )}
        />
        <HugeiconsIcon icon={Archive01Icon} size={12} strokeWidth={1.75} className="shrink-0" />
        <span>Stashes</span>
        {stashes.length > 0 && (
          <span className="ml-auto rounded-sm bg-muted/55 px-1 py-px text-[9.5px] tabular-nums text-muted-foreground/85">
            {stashes.length}
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-2 pb-2 pt-1">
          <div className="mb-1.5 flex items-center gap-1">
            {showPushInput ? (
              <>
                <input
                  ref={inputRef}
                  type="text"
                  value={pushMessage}
                  onChange={(e) => setPushMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handlePush();
                    if (e.key === "Escape") setShowPushInput(false);
                  }}
                  placeholder="Stash message (optional)"
                  className="h-6 min-w-0 flex-1 rounded border border-border/60 bg-background px-2 text-[11px] outline-none focus:border-primary/60"
                />
                <Button
                  size="xs"
                  className="h-6 shrink-0 cursor-pointer text-[10.5px]"
                  disabled={busy === "push"}
                  onClick={() => void handlePush()}
                >
                  {busy === "push" ? <Spinner className="size-2.5" /> : "Stash"}
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  className="h-6 shrink-0 cursor-pointer text-[10.5px]"
                  onClick={() => setShowPushInput(false)}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                size="xs"
                variant="secondary"
                className="h-6 cursor-pointer gap-1.5 text-[10.5px]"
                onClick={() => setShowPushInput(true)}
              >
                <HugeiconsIcon icon={Archive01Icon} size={10} strokeWidth={1.75} />
                Stash changes
              </Button>
            )}
            <Button
              size="xs"
              variant="ghost"
              className="ml-auto h-6 cursor-pointer text-[10.5px] text-muted-foreground"
              onClick={() => void load()}
            >
              {loading ? <Spinner className="size-2.5" /> : "Refresh"}
            </Button>
          </div>

          {error && (
            <div className="mb-1 rounded bg-destructive/10 px-2 py-1 text-[10.5px] text-destructive">
              {error}
            </div>
          )}

          {loading && stashes.length === 0 ? (
            <div className="flex items-center gap-2 py-2 text-[11px] text-muted-foreground">
              <Spinner className="size-3" />
              Loading stashes…
            </div>
          ) : stashes.length === 0 ? (
            <div className="py-2 text-[11px] text-muted-foreground/65">
              No stashes yet.
            </div>
          ) : (
            <ul className="space-y-px">
              {stashes.map((entry) => {
                const isBusy = busy === entry.refName;
                const label = entry.message.replace(/^(?:WIP on|On) [^:]+:\s*[a-f0-9]+ /, "");
                return (
                  <li
                    key={entry.refName}
                    className="group flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] hover:bg-accent/30"
                  >
                    <HugeiconsIcon
                      icon={GitBranchIcon}
                      size={11}
                      strokeWidth={1.75}
                      className="shrink-0 text-muted-foreground/60"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium leading-tight text-foreground/90">
                        {label || entry.message}
                      </div>
                      <div className="text-[10px] tabular-nums text-muted-foreground/65">
                        {entry.refName} · {relativeTime(entry.timestampSecs)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      {isBusy ? (
                        <Spinner className="size-2.5" />
                      ) : (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => void handlePop(entry)}
                                className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                              >
                                <HugeiconsIcon
                                  icon={ArrowDown01Icon}
                                  size={11}
                                  strokeWidth={1.9}
                                />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-[10.5px]">
                              Pop (apply &amp; drop)
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => void handleApply(entry)}
                                className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                              >
                                <HugeiconsIcon
                                  icon={GitBranchIcon}
                                  size={11}
                                  strokeWidth={1.9}
                                />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-[10.5px]">
                              Apply (keep stash)
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => void handleDrop(entry)}
                                className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              >
                                <HugeiconsIcon
                                  icon={Delete02Icon}
                                  size={11}
                                  strokeWidth={1.9}
                                />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-[10.5px]">
                              Drop stash
                            </TooltipContent>
                          </Tooltip>
                        </>
                      )}
                    </div>
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
