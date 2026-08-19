// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { native, type GitCheckpoint } from "@/modules/ai/lib/native";
import { useCallback, useEffect, useState } from "react";

type Props = {
  repoRoot: string;
  onRestored?: () => void;
};

function relativeTime(secs: number): string {
  if (!secs) return "";
  const diff = Date.now() / 1000 - secs;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/**
 * Snapshots taken automatically before each agent file edit, with one-click
 * revert.
 *
 * Deliberately collapsed by default and only loaded when opened — the whole
 * point is that it sits out of the way until something goes wrong.
 */
export function CheckpointSection({ repoRoot, onRestored }: Props) {
  const [checkpoints, setCheckpoints] = useState<GitCheckpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!repoRoot) return;
    setLoading(true);
    try {
      setCheckpoints(await native.gitCheckpointList(repoRoot));
    } catch {
      // Not a repo, or git unavailable — an empty list is the right answer.
      setCheckpoints([]);
    } finally {
      setLoading(false);
    }
  }, [repoRoot]);

  useEffect(() => {
    if (expanded) void load();
  }, [expanded, load]);

  const handleRestore = async (cp: GitCheckpoint) => {
    setBusy(cp.refName);
    setError(null);
    try {
      await native.gitCheckpointRestore(repoRoot, cp.refName);
      onRestored?.();
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to restore checkpoint");
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (cp: GitCheckpoint) => {
    setBusy(cp.refName);
    setError(null);
    try {
      await native.gitCheckpointDelete(repoRoot, cp.refName);
      await load();
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to delete checkpoint");
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
        <Icon
          name="chevron-down"
          size="xs"
          className={cn( "shrink-0 transition-transform", expanded ? "rotate-0" : "-rotate-90", )}
        />
        <Icon name="magic" className="shrink-0" />
        <span>AI checkpoints</span>
        {checkpoints.length > 0 && (
          <span className="ml-auto rounded-sm bg-muted/55 px-1 py-px text-[9.5px] tabular-nums text-muted-foreground/85">
            {checkpoints.length}
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-2 pb-2 pt-1">
          <div className="mb-1.5 flex items-center">
            <p className="text-[10px] text-muted-foreground/70">
              Snapshots taken before each agent edit. Reverting is itself
              checkpointed.
            </p>
            <Button
              size="xs"
              variant="ghost"
              className="ml-auto h-6 cursor-pointer text-[10.5px] text-muted-foreground"
              onClick={() => void load()}
              disabled={loading}
            >
              <Icon
                name="refresh"
                size="xs"
                className={loading ? "nexis-spin" : ""}
              />
            </Button>
          </div>

          {error && (
            <p className="mb-1.5 rounded bg-destructive/10 px-1.5 py-1 text-[10px] text-destructive">
              {error}
            </p>
          )}

          {checkpoints.length === 0 && !loading ? (
            <p className="py-2 text-center text-[10.5px] text-muted-foreground/60">
              No checkpoints yet
            </p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {checkpoints.map((cp) => (
                <div
                  key={cp.refName}
                  className="group flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-muted/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] text-foreground">
                      {cp.label || "Agent edit"}
                    </p>
                    <p className="text-[9.5px] text-muted-foreground/70">
                      {relativeTime(cp.timestampSecs)} · {cp.sha.slice(0, 7)}
                    </p>
                  </div>
                  <Button
                    size="xs"
                    variant="secondary"
                    className="h-5 shrink-0 cursor-pointer px-1.5 text-[10px] opacity-0 transition-opacity group-hover:opacity-100"
                    disabled={busy === cp.refName}
                    onClick={() => void handleRestore(cp)}
                    title="Restore tracked files to this snapshot. Overwrites changes made since — but takes a new checkpoint first, so this is undoable."
                  >
                    {busy === cp.refName ? (
                      <Spinner className="size-2.5" />
                    ) : (
                      "Revert"
                    )}
                  </Button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(cp)}
                    title="Delete this checkpoint"
                    className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-[opacity,color,background-color] hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  >
                    <Icon name="delete" size="xs" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
