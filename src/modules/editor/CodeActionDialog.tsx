// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * CodeActionDialog — semantic refactorings via LSP code actions.
 *
 * Opened with Ctrl+Shift+R on a selection (or cursor position). Requests
 * `textDocument/codeAction` for the range, filters to `refactor.*` kinds
 * (Extract Function / Inline Variable first), and applies the chosen action's
 * workspace edit to disk. Actions without a literal edit are resolved via
 * `codeAction/resolve`, or executed server-side via `workspace/executeCommand`
 * (the server then pushes a `workspace/applyEdit` that the LSP client handles).
 */
import { cn } from "@/lib/utils";
import { lspClient } from "@/modules/lsp/client";
import { languageIdForPath } from "@/modules/lsp/languages";
import {
  applyWorkspaceEdit,
  workspaceEditHasChanges,
} from "@/modules/lsp/applyEdit";
import type { LspCodeAction, LspRange } from "@/modules/lsp/protocol";
import { Alert02Icon, CheckmarkCircle01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";

type Props = {
  /** Absolute path of the file the refactor was triggered from. */
  filePath: string;
  workspaceRoot: string;
  /** 0-based selection range, LSP coordinates. */
  range: LspRange;
  onClose: () => void;
  onApplied: (actionTitle: string) => void;
};

/** Lower = listed earlier. Extract function and inline variable lead. */
function actionRank(kind: string | undefined): number {
  if (!kind) return 50;
  if (kind.startsWith("refactor.extract.function")) return 0;
  if (kind.startsWith("refactor.inline")) return 1;
  if (kind.startsWith("refactor.extract")) return 2;
  if (kind.startsWith("refactor.rewrite")) return 3;
  if (kind.startsWith("refactor")) return 4;
  return 50;
}

function kindBadge(kind: string | undefined): string {
  if (!kind) return "refactor";
  if (kind.startsWith("refactor.extract")) return "extract";
  if (kind.startsWith("refactor.inline")) return "inline";
  if (kind.startsWith("refactor.rewrite")) return "rewrite";
  return kind.replace(/^refactor\.?/, "") || "refactor";
}

export function CodeActionDialog({
  filePath,
  workspaceRoot,
  range,
  onClose,
  onApplied,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<LspCodeAction[]>([]);
  const [noServer, setNoServer] = useState(false);
  const [selected, setSelected] = useState(0);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const langId = languageIdForPath(filePath);
    if (!langId) {
      setNoServer(true);
      setLoading(false);
      return;
    }
    void (async () => {
      const entry = await lspClient.getOrCreateSession(langId, workspaceRoot);
      if (cancelled) return;
      if (!entry) {
        setNoServer(true);
        setLoading(false);
        return;
      }
      const all = await lspClient.codeActions(entry, filePath, range, [
        "refactor",
      ]);
      if (cancelled) return;
      const refactors = all
        .filter((a) => !a.disabled && (a.kind ?? "").startsWith("refactor"))
        .sort(
          (a, b) =>
            actionRank(a.kind) - actionRank(b.kind) ||
            Number(b.isPreferred ?? false) - Number(a.isPreferred ?? false),
        );
      setActions(refactors);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // range is a fresh object per open; the dialog is mounted once per trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, workspaceRoot]);

  const apply = async (action: LspCodeAction) => {
    setApplying(true);
    setError(null);
    try {
      const langId = languageIdForPath(filePath);
      const entry = langId
        ? await lspClient.getOrCreateSession(langId, workspaceRoot)
        : null;
      if (!entry) throw new Error("Language server unavailable");

      let edit = action.edit ?? null;
      if (!edit) {
        const resolved = await lspClient.resolveCodeAction(entry, action);
        if (resolved?.edit) edit = resolved.edit;
      }
      if (workspaceEditHasChanges(edit)) {
        await applyWorkspaceEdit(edit);
        finish(action.title);
        return;
      }
      if (action.command) {
        const ok = await lspClient.executeCommand(
          entry,
          action.command.command,
          action.command.arguments,
        );
        if (!ok) throw new Error("Server rejected the command");
        // The edit arrives asynchronously via workspace/applyEdit.
        finish(action.title);
        return;
      }
      throw new Error("Server returned no applicable edit");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setApplying(false);
    }
  };

  const finish = (title: string) => {
    setDone(title);
    setTimeout(() => {
      onApplied(title);
      onClose();
    }, 700);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, actions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && actions[selected] && !applying && !done) {
      e.preventDefault();
      void apply(actions[selected]);
    }
  };

  useEffect(() => {
    listRef.current?.focus();
  }, [loading]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[460px] rounded-xl border border-border/60 bg-card shadow-2xl">
        <div className="border-b border-border/40 px-4 py-3">
          <p className="text-[12px] font-semibold text-foreground">Refactor</p>
          <p className="text-[11px] text-muted-foreground">
            Semantic refactorings from the language server for the current
            selection
          </p>
        </div>

        <div
          ref={listRef}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className="max-h-[300px] overflow-y-auto p-2 outline-none"
        >
          {loading ? (
            <p className="px-2 py-3 text-[11px] text-muted-foreground/60">
              Asking the language server…
            </p>
          ) : noServer ? (
            <p className="px-2 py-3 text-[11px] text-muted-foreground">
              No language server is available for this file. Semantic
              refactorings (extract function, inline variable) need a running
              LSP server — the AI Refactor panel (Alt+Shift+X) works without
              one.
            </p>
          ) : actions.length === 0 ? (
            <p className="px-2 py-3 text-[11px] text-muted-foreground">
              The language server offers no refactorings for this selection.
              Try selecting a complete expression or statement — extract
              function needs a selection, inline variable needs the cursor on
              a variable.
            </p>
          ) : (
            actions.map((a, i) => (
              <button
                key={`${a.title}-${i}`}
                type="button"
                disabled={applying || !!done}
                onMouseEnter={() => setSelected(i)}
                onClick={() => void apply(a)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded px-2.5 py-1.5 text-left",
                  "transition-colors disabled:cursor-not-allowed",
                  i === selected
                    ? "bg-primary/15 text-foreground"
                    : "text-foreground/80 hover:bg-muted/40",
                )}
              >
                <span className="min-w-0 truncate text-[11.5px]">{a.title}</span>
                <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {kindBadge(a.kind)}
                </span>
              </button>
            ))
          )}
        </div>

        {(done || error) && (
          <div className="px-4 pb-1">
            {done && (
              <div className="flex items-center gap-1.5 text-[11px] text-green-500">
                <HugeiconsIcon
                  icon={CheckmarkCircle01Icon}
                  size={12}
                  strokeWidth={1.75}
                />
                Applied “{done}”
              </div>
            )}
            {error && (
              <div className="flex items-center gap-1.5 text-[11px] text-destructive">
                <HugeiconsIcon icon={Alert02Icon} size={12} strokeWidth={1.75} />
                {error}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border/40 px-4 py-3">
          <span className="text-[9.5px] text-muted-foreground/50">
            ↑↓ to choose · Enter to apply
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border/60 px-3 py-1.5 text-[11.5px] text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
