// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * CodeReviewPanel — on-demand AI review of staged or all unstaged diff.
 *
 * Loads the git diff, shows a summary (files + lines), and sends the diff
 * to the AI panel as a pre-filled review prompt.  No new Rust commands are
 * needed — we reuse the existing `git_diff` IPC.
 */
import { invoke } from "@tauri-apps/api/core";
import { sendMessage, useChatStore } from "@/modules/ai/store/chatStore";
import { cn } from "@/lib/utils";
import {
  AiChat02Icon,
  Alert02Icon,
  CheckmarkCircle01Icon,
  Refresh01Icon,
} from "@hugeicons/core-free-icons";
import { CodeSquareIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useMemo, useState } from "react";

type GitDiffResult = { diffText: string; truncated: boolean };

type LoadState = "idle" | "loading" | "ready" | "error";
type ReviewScope = "staged" | "all";

type DiffStats = {
  files: number;
  additions: number;
  deletions: number;
};

function parseDiffStats(diffText: string): DiffStats {
  const files = (diffText.match(/^diff --git /gm) ?? []).length;
  // Count lines starting with + or - but not +++ or ---
  const additions = (diffText.match(/^\+(?!\+\+)/gm) ?? []).length;
  const deletions = (diffText.match(/^-(?!--)/gm) ?? []).length;
  return { files, additions, deletions };
}

type Props = {
  workspaceRoot: string | null;
};

export function CodeReviewPanel({ workspaceRoot }: Props) {
  const [scope, setScope] = useState<ReviewScope>("staged");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [diff, setDiff] = useState<GitDiffResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const openAiPanel = useChatStore((s) => s.openPanel);

  const loadDiff = useCallback(async () => {
    if (!workspaceRoot) return;
    setLoadState("loading");
    setError(null);
    try {
      const result = await invoke<GitDiffResult>("git_diff", {
        repoRoot: workspaceRoot,
        path: null,
        staged: scope === "staged",
        workspace: null,
      });
      setDiff(result);
      setLoadState("ready");
    } catch (e) {
      setError(String(e));
      setLoadState("error");
    }
  }, [workspaceRoot, scope]);

  useEffect(() => {
    void loadDiff();
  }, [loadDiff]);

  const stats = useMemo(
    () => (diff?.diffText ? parseDiffStats(diff.diffText) : null),
    [diff],
  );

  const reviewWithAi = useCallback(async () => {
    if (!diff?.diffText || !stats) return;
    setSending(true);
    try {
      const text = diff.diffText.slice(0, 12_000);
      const scopeLabel = scope === "staged" ? "staged" : "all unstaged";
      const truncNote = diff.truncated
        ? "\n\n> (diff truncated to 12k chars — some files may be missing)"
        : "";
      const prompt = `Please review the following ${scopeLabel} git diff:\n\n\`\`\`diff\n${text}\n\`\`\`${truncNote}\n\nFocus on:\n- Potential bugs or logic errors\n- Missing error handling or edge cases\n- Code style / readability improvements\n- Performance considerations\n\nProvide specific, actionable feedback with line references where possible.`;
      openAiPanel();
      await sendMessage(prompt);
    } finally {
      setSending(false);
    }
  }, [diff, stats, scope, openAiPanel]);

  const hasChanges = stats && stats.files > 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <HugeiconsIcon
          icon={CodeSquareIcon}
          size={13}
          strokeWidth={1.75}
          className="text-muted-foreground"
        />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Code Review
        </span>
        {loadState === "loading" && (
          <span className="ml-auto text-[10px] text-muted-foreground/60">
            Loading…
          </span>
        )}
        {loadState !== "loading" && workspaceRoot && (
          <button
            type="button"
            title="Refresh diff"
            onClick={() => void loadDiff()}
            className="ml-auto flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <HugeiconsIcon icon={Refresh01Icon} size={11} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Scope toggle */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border/30 px-3 py-2">
        <span className="mr-1 text-[10px] text-muted-foreground">Review:</span>
        {(["staged", "all"] as ReviewScope[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            className={cn(
              "rounded px-2 py-0.5 text-[10.5px] font-medium transition-colors",
              scope === s
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
            )}
          >
            {s === "staged" ? "Staged only" : "All changes"}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col">
        {!workspaceRoot ? (
          <EmptyState message="No workspace open" />
        ) : loadState === "error" ? (
          <div className="p-4 text-center">
            <HugeiconsIcon
              icon={Alert02Icon}
              size={20}
              strokeWidth={1.5}
              className="mx-auto mb-2 text-destructive"
            />
            <p className="text-xs text-destructive">
              {error ?? "Failed to load diff"}
            </p>
            <button
              type="button"
              onClick={() => void loadDiff()}
              className="mt-2 text-[10px] text-primary hover:underline"
            >
              Retry
            </button>
          </div>
        ) : loadState === "loading" ? (
          <EmptyState message="Loading diff…" />
        ) : !hasChanges ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
            <HugeiconsIcon
              icon={CheckmarkCircle01Icon}
              size={24}
              strokeWidth={1.5}
              className="text-green-500/60"
            />
            <p className="text-xs text-muted-foreground">
              No {scope === "staged" ? "staged" : ""} changes to review
            </p>
          </div>
        ) : (
          <>
            {/* Stats summary */}
            <div className="flex shrink-0 items-center gap-3 border-b border-border/30 px-3 py-2.5">
              <span className="text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {stats.files}
                </span>{" "}
                file{stats.files !== 1 ? "s" : ""}
              </span>
              <span className="text-[11px] text-green-500">
                +{stats.additions}
              </span>
              <span className="text-[11px] text-red-500">
                −{stats.deletions}
              </span>
              {diff?.truncated && (
                <span className="ml-auto text-[9px] text-amber-500/80">
                  truncated
                </span>
              )}
            </div>

            {/* Diff preview (scrollable) */}
            <pre className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words p-3 font-mono text-[10px] leading-relaxed text-foreground/70">
              {diff?.diffText}
            </pre>

            {/* Review button */}
            <div className="shrink-0 border-t border-border/30 p-3">
              <button
                type="button"
                onClick={() => void reviewWithAi()}
                disabled={sending}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-md py-2 text-[11.5px] font-medium transition-colors",
                  "bg-primary/90 text-primary-foreground hover:bg-primary",
                  "disabled:cursor-wait disabled:opacity-60",
                )}
              >
                <HugeiconsIcon
                  icon={AiChat02Icon}
                  size={13}
                  strokeWidth={1.75}
                />
                {sending ? "Sending to AI…" : "Review with AI"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-[11px] text-muted-foreground/60">{message}</p>
    </div>
  );
}
