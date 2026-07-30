// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * ConflictSection — collapsible list of merge-conflict files in the
 * source-control sidebar with a one-click "Resolve with AI" action.
 *
 * Conflict detection: any file whose indexStatus or worktreeStatus is "U"
 * (unmerged), or where both sides are "A" (both added) or "D" (both deleted).
 */
import { basename } from "@/lib/path";
import { cn } from "@/lib/utils";
import { sendMessage, useChatStore } from "@/modules/ai/store/chatStore";
import { native } from "@/modules/ai/lib/native";
import type { GitChangedFile } from "@/modules/ai/lib/native";
import {
  AiChat02Icon,
  Alert02Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useState } from "react";

type Props = {
  repoRoot: string;
  changedFiles: GitChangedFile[];
};

function isConflict(f: GitChangedFile): boolean {
  return (
    f.indexStatus === "U" ||
    f.worktreeStatus === "U" ||
    (f.indexStatus === "A" && f.worktreeStatus === "A") ||
    (f.indexStatus === "D" && f.worktreeStatus === "D")
  );
}

function conflictTypeLabel(f: GitChangedFile): string {
  if (f.indexStatus === "U" && f.worktreeStatus === "U") return "both modified";
  if (f.indexStatus === "A" && f.worktreeStatus === "A") return "both added";
  if (f.indexStatus === "D" && f.worktreeStatus === "D") return "both deleted";
  if (f.indexStatus === "A" && f.worktreeStatus === "U") return "added by us";
  if (f.indexStatus === "U" && f.worktreeStatus === "A") return "added by them";
  if (f.indexStatus === "D" && f.worktreeStatus === "U") return "deleted by us";
  if (f.indexStatus === "U" && f.worktreeStatus === "D") return "deleted by them";
  return "conflict";
}

export function ConflictSection({ repoRoot, changedFiles }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const openAiPanel = useChatStore((s) => s.openPanel);

  const conflicts = changedFiles.filter(isConflict);

  const resolveWithAi = useCallback(
    async (f: GitChangedFile) => {
      setResolvingId(f.path);
      try {
        const fullPath = `${repoRoot}/${f.path}`.replace(/\\/g, "/");
        const readResult = await native.readFile(fullPath);

        let content: string;
        if (readResult.kind === "text") {
          content = readResult.content;
        } else if (readResult.kind === "toolarge") {
          content = "(file too large to inline — please review manually)";
        } else {
          content = "(binary file — cannot resolve automatically)";
        }

        const type = conflictTypeLabel(f);
        const prompt = `I have a merge conflict in \`${f.path}\` (${type}). Here is the file content with conflict markers:\n\n\`\`\`\n${content.slice(0, 10_000)}\n\`\`\`\n\nPlease:\n1. Explain what each side of the conflict contains\n2. Propose a resolved version of the file\n3. Highlight any tradeoffs in your chosen resolution`;

        openAiPanel();
        await sendMessage(prompt);
      } catch {
        // Fallback: open AI with a simpler prompt
        openAiPanel();
        await sendMessage(
          `Help me resolve the merge conflict in \`${f.path}\` (${conflictTypeLabel(f)}). The repo root is \`${repoRoot}\`.`,
        );
      } finally {
        setResolvingId(null);
      }
    },
    [repoRoot, openAiPanel],
  );

  if (conflicts.length === 0) return null;

  return (
    <div className="border-t border-border/50">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left hover:bg-muted/20"
      >
        <HugeiconsIcon
          icon={expanded ? ArrowDown01Icon : ArrowRight01Icon}
          size={12}
          strokeWidth={2}
          className="shrink-0 text-muted-foreground"
        />
        <HugeiconsIcon
          icon={Alert02Icon}
          size={11}
          strokeWidth={2}
          className="shrink-0 text-amber-500"
        />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Conflicts
        </span>
        <span className="ml-auto rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-500">
          {conflicts.length}
        </span>
      </button>

      {expanded && (
        <ul className="pb-1">
          {conflicts.map((f) => {
            const busy = resolvingId === f.path;
            return (
              <li
                key={f.path}
                className="group flex items-center gap-2 px-3 py-1.5 hover:bg-muted/20"
              >
                {/* Conflict type badge */}
                <span className="shrink-0 rounded bg-amber-500/10 px-1 py-0.5 font-mono text-[9px] font-bold text-amber-500">
                  {conflictTypeLabel(f)}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">
                    {basename(f.path)}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {f.path}
                  </p>
                </div>

                <button
                  type="button"
                  title="Resolve with AI"
                  disabled={busy}
                  onClick={() => void resolveWithAi(f)}
                  className={cn(
                    "flex shrink-0 items-center gap-1 rounded border border-primary/30 bg-primary/8 px-1.5 py-0.5",
                    "text-[10px] font-medium text-primary/80 transition-colors",
                    "hover:bg-primary/15 hover:text-primary disabled:cursor-wait disabled:opacity-50",
                  )}
                >
                  <HugeiconsIcon
                    icon={AiChat02Icon}
                    size={10}
                    strokeWidth={1.75}
                  />
                  {busy ? "Sending…" : "Resolve"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
