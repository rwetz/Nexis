// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * AgentQueuePanel — sidebar panel for queuing multiple AI prompts.
 *
 * Tasks are processed sequentially by the background worker in
 * useAgentQueueStore.  Each task shows its status (queued / running / done /
 * failed) and can be retried or removed.
 */
import { cn } from "@/lib/utils";
import {
  Add01Icon,
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Alert02Icon,
  Refresh01Icon,
  Time01Icon,
  PlayIcon,
} from "@hugeicons/core-free-icons";
import { Queue01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useRef, useState } from "react";
import {
  useAgentQueueStore,
  type QueueTask,
  type QueueTaskStatus,
} from "./useAgentQueueStore";

function statusIcon(status: QueueTaskStatus) {
  switch (status) {
    case "queued":
      return Time01Icon;
    case "running":
      return PlayIcon;
    case "done":
      return CheckmarkCircle01Icon;
    case "failed":
      return Alert02Icon;
  }
}

function statusColor(status: QueueTaskStatus): string {
  switch (status) {
    case "queued":
      return "text-muted-foreground";
    case "running":
      return "text-primary";
    case "done":
      return "text-green-500";
    case "failed":
      return "text-destructive";
  }
}

function formatDuration(task: QueueTask): string | null {
  if (!task.startedAt || !task.completedAt) return null;
  const ms = task.completedAt - task.startedAt;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function AgentQueuePanel() {
  const tasks = useAgentQueueStore((s) => s.tasks);
  const addTask = useAgentQueueStore((s) => s.addTask);
  const removeTask = useAgentQueueStore((s) => s.removeTask);
  const clearDone = useAgentQueueStore((s) => s.clearDone);
  const retryTask = useAgentQueueStore((s) => s.retryTask);

  const [showForm, setShowForm] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [label, setLabel] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const queuedCount = tasks.filter((t) => t.status === "queued").length;
  const runningCount = tasks.filter((t) => t.status === "running").length;
  const doneCount = tasks.filter(
    (t) => t.status === "done" || t.status === "failed",
  ).length;

  const handleAdd = useCallback(() => {
    const p = prompt.trim();
    if (!p) return;
    addTask(p, label.trim() || undefined);
    setPrompt("");
    setLabel("");
    setShowForm(false);
  }, [prompt, label, addTask]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <HugeiconsIcon
          icon={Queue01Icon}
          size={13}
          strokeWidth={1.75}
          className="text-muted-foreground"
        />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Agent Queue
        </span>
        {(queuedCount > 0 || runningCount > 0) && (
          <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold text-primary">
            {runningCount > 0
              ? `${runningCount} running`
              : `${queuedCount} queued`}
          </span>
        )}
        {doneCount > 0 && (
          <button
            type="button"
            title="Clear completed tasks"
            onClick={clearDone}
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground",
              (queuedCount > 0 || runningCount > 0) && "ml-1",
              !(queuedCount > 0 || runningCount > 0) && "ml-auto",
            )}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Task list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tasks.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-8 text-center">
            <HugeiconsIcon
              icon={Queue01Icon}
              size={24}
              strokeWidth={1.5}
              className="text-muted-foreground/30"
            />
            <p className="text-xs text-muted-foreground">
              No tasks queued yet.
            </p>
            <p className="text-[10px] text-muted-foreground/60">
              Add prompts below — they run sequentially while you work.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/20 py-1">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="group flex items-start gap-2 px-3 py-2 hover:bg-muted/20"
              >
                {/* Status icon */}
                <div
                  className={cn(
                    "mt-0.5 shrink-0",
                    statusColor(task.status),
                    task.status === "running" && "animate-pulse",
                  )}
                >
                  <HugeiconsIcon
                    icon={statusIcon(task.status)}
                    size={12}
                    strokeWidth={1.75}
                  />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{task.label}</p>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-[10px] font-medium capitalize",
                        statusColor(task.status),
                      )}
                    >
                      {task.status}
                    </span>
                    {formatDuration(task) && (
                      <span className="text-[10px] text-muted-foreground/60">
                        {formatDuration(task)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
                  {task.status === "failed" && (
                    <button
                      type="button"
                      title="Retry"
                      onClick={() => retryTask(task.id)}
                      className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <HugeiconsIcon
                        icon={Refresh01Icon}
                        size={10}
                        strokeWidth={2}
                      />
                    </button>
                  )}
                  {task.status !== "running" && (
                    <button
                      type="button"
                      title="Remove"
                      onClick={() => removeTask(task.id)}
                      className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <HugeiconsIcon
                        icon={Cancel01Icon}
                        size={10}
                        strokeWidth={2}
                      />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add task form / button */}
      <div className="shrink-0 border-t border-border/30 p-3">
        {showForm ? (
          <div className="space-y-2">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Task label (optional)"
              className="w-full rounded border border-border/60 bg-muted/30 px-2 py-1 text-xs text-foreground outline-none focus:border-primary/60"
            />
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Prompt for the AI agent…"
              rows={4}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setShowForm(false);
                  setPrompt("");
                  setLabel("");
                }
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  handleAdd();
                }
              }}
              className="w-full resize-none rounded border border-border/60 bg-muted/30 px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary/60"
            />
            <p className="text-[9px] text-muted-foreground/60">
              Ctrl+Enter to add · Esc to cancel
            </p>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setPrompt("");
                  setLabel("");
                }}
                className="flex-1 rounded border border-border/60 py-1 text-xs text-muted-foreground hover:bg-muted/40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={!prompt.trim()}
                className="flex-1 rounded bg-primary/90 py-1 text-xs font-medium text-primary-foreground hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                Add to Queue
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded border border-border/50 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          >
            <HugeiconsIcon icon={Add01Icon} size={11} strokeWidth={2} />
            Add task
          </button>
        )}
      </div>
    </div>
  );
}
