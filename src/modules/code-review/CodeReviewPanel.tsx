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
 *
 * The workspace root is not necessarily a repository, so the panel resolves
 * the real repo root first and renders a plain "not a git repository" state
 * when there is none. Handing a non-repo directory to `git_diff` used to make
 * git fall back to `--no-index` mode, which rejects `--cached` and answers
 * with its own usage block — eighty lines of red prose filling the pane.
 */
import { Icon } from "@/components/icon";
import { basename } from "@/lib/path";
import { native } from "@/modules/ai/lib/native";
import { sendMessage, useChatStore } from "@/modules/ai/store/chatStore";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type GitDiffResult = { diffText: string; truncated: boolean };

type LoadState = "idle" | "loading" | "ready" | "error" | "no-repo";
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
  const [repoRoot, setRepoRoot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const openAiPanel = useChatStore((s) => s.openPanel);
  // Guards against a slow load landing after a newer one — switching scope or
  // workspace while a diff is in flight would otherwise show the stale answer.
  const requestRef = useRef(0);

  const loadDiff = useCallback(async () => {
    if (!workspaceRoot) return;
    const request = ++requestRef.current;
    setLoadState("loading");
    setError(null);
    try {
      const repo = await native.gitResolveRepo(workspaceRoot);
      if (request !== requestRef.current) return;
      if (!repo) {
        setRepoRoot(null);
        setDiff(null);
        setLoadState("no-repo");
        return;
      }
      setRepoRoot(repo.repoRoot);
      const result = await native.gitDiff(repo.repoRoot, null, scope === "staged");
      if (request !== requestRef.current) return;
      setDiff(result);
      setLoadState("ready");
    } catch (e) {
      if (request !== requestRef.current) return;
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
        <Icon name="code-box" className="text-muted-foreground" />
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
            <Icon name="refresh" size="xs" />
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
        {repoRoot && (
          <span
            title={repoRoot}
            className="ml-auto max-w-[45%] truncate text-[10px] text-muted-foreground/60"
          >
            {basename(repoRoot)}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col">
        {!workspaceRoot ? (
          <EmptyState message="No workspace open" />
        ) : loadState === "no-repo" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
            <Icon name="git-branch" size="xl" className="text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">Not a git repository</p>
            <p className="max-w-[220px] text-[10.5px] leading-relaxed text-muted-foreground/60">
              Code review reads a git diff. Open a workspace inside a repository,
              or run <span className="font-mono">git init</span> here.
            </p>
            <button
              type="button"
              onClick={() => void loadDiff()}
              className="mt-1 text-[10px] text-primary hover:underline"
            >
              Check again
            </button>
          </div>
        ) : loadState === "error" ? (
          <ErrorState error={error} onRetry={() => void loadDiff()} />
        ) : loadState === "loading" ? (
          <EmptyState message="Loading diff…" />
        ) : !hasChanges ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
            <Icon name="success" size="xl" className="text-green-500/60" />
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
                <Icon name="ai-chat" />
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

/**
 * Git's stderr has no length ceiling — a usage block or a hook's output can run
 * to dozens of lines. Show the first line, keep the rest behind a disclosure,
 * and give the disclosure its own scroll box so the panel layout survives.
 */
function ErrorState({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const text = (error ?? "Failed to load diff").trim();
  const [summary, ...rest] = text.split("\n");
  const hasDetail = rest.some((line) => line.trim() !== "");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      <div className="flex items-start gap-2">
        <Icon name="alert" className="mt-px shrink-0 text-destructive" />
        <p className="min-w-0 break-words text-[11px] leading-relaxed text-destructive">
          {summary}
        </p>
      </div>

      {hasDetail && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 self-start text-[10px] text-muted-foreground hover:text-foreground"
        >
          <Icon name={expanded ? "chevron-down" : "chevron-right"} size="xs" />
          {expanded ? "Hide details" : "Show details"}
        </button>
      )}

      {expanded && hasDetail && (
        <pre className="min-h-0 flex-1 overflow-auto rounded border border-border/50 bg-muted/30 p-2 font-mono text-[10px] leading-relaxed whitespace-pre-wrap break-words text-muted-foreground">
          {text}
        </pre>
      )}

      <button
        type="button"
        onClick={onRetry}
        className="self-start text-[10px] text-primary hover:underline"
      >
        Retry
      </button>
    </div>
  );
}
