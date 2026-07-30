// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { native, type GrepHit } from "@/modules/ai/lib/native";
import { cn } from "@/lib/utils";
import { lspClient } from "@/modules/lsp/client";
import { languageIdForPath } from "@/modules/lsp/languages";
import {
  applyWorkspaceEdit,
  notifyFilesRewritten,
  workspaceEditHasChanges,
} from "@/modules/lsp/applyEdit";
import { Alert02Icon, CheckmarkCircle01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";

type Props = {
  symbol: string;
  /** Absolute path of the file the rename was triggered from. */
  filePath: string;
  /** 0-based cursor position of the symbol, for LSP textDocument/rename. */
  line: number;
  character: number;
  workspaceRoot: string;
  onClose: () => void;
  onApplied: (oldSymbol: string, newSymbol: string) => void;
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type FileSummary = {
  rel: string;
  count: number;
};

export function RenameDialog({
  symbol,
  filePath,
  line,
  character,
  workspaceRoot,
  onClose,
  onApplied,
}: Props) {
  const [newName, setNewName] = useState(symbol);
  const [hits, setHits] = useState<GrepHit[]>([]);
  const [fileSummaries, setFileSummaries] = useState<FileSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [lspReady, setLspReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const pattern = `\\b${escapeRegex(symbol)}\\b`;
    native.grep({ pattern, root: workspaceRoot, maxResults: 500 })
      .then((res) => {
        setHits(res.hits);
        const byFile = new Map<string, number>();
        for (const h of res.hits) {
          byFile.set(h.rel, (byFile.get(h.rel) ?? 0) + 1);
        }
        setFileSummaries(Array.from(byFile.entries()).map(([rel, count]) => ({ rel, count })));
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, [symbol, workspaceRoot]);

  // Detect whether a language server can drive a semantic rename for this
  // file. The session is almost always already running (the open editor
  // created it), so getOrCreateSession just hands back the existing entry.
  useEffect(() => {
    let cancelled = false;
    const langId = languageIdForPath(filePath);
    if (!langId) return;
    void lspClient
      .getOrCreateSession(langId, workspaceRoot)
      .then((entry) => {
        if (!cancelled) setLspReady(!!entry);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [filePath, workspaceRoot]);

  const finishApplied = () => {
    setDone(true);
    setTimeout(() => {
      onApplied(symbol, newName.trim());
      onClose();
    }, 800);
  };

  const apply = async () => {
    if (!newName.trim() || newName === symbol) { onClose(); return; }
    setApplying(true);
    setError(null);

    try {
      // 1) Semantic rename via the language server when one is available —
      //    only true references change (not comments/strings/substrings).
      if (lspReady) {
        const langId = languageIdForPath(filePath);
        const entry = langId
          ? await lspClient.getOrCreateSession(langId, workspaceRoot)
          : null;
        const edit = entry
          ? await lspClient.rename(entry, filePath, line, character, newName.trim())
          : null;
        if (workspaceEditHasChanges(edit)) {
          await applyWorkspaceEdit(edit);
          finishApplied();
          return;
        }
        // Server returned nothing actionable — fall through to text rename.
      }

      // 2) Fallback: word-boundary text find/replace across grep hits.
      const pattern = new RegExp(`\\b${escapeRegex(symbol)}\\b`, "g");
      const uniquePaths = [...new Set(hits.map((h) => h.rel))];
      const rewritten: string[] = [];
      for (const rel of uniquePaths) {
        const fullPath = `${workspaceRoot}/${rel}`;
        const result = await native.readFile(fullPath);
        if (result.kind === "text") {
          const updated = result.content.replace(pattern, newName.trim());
          if (updated !== result.content) {
            await native.writeFile(fullPath, updated);
            rewritten.push(fullPath);
          }
        }
      }
      notifyFilesRewritten(rewritten);
      finishApplied();
    } catch (e) {
      setError(String(e));
      setApplying(false);
    }
  };

  const totalOccurrences = hits.length;
  const isValid = newName.trim().length > 0 && newName !== symbol;

  return (
    <div
      // Click-outside catcher; Escape closes from the input below.
      // `presentation` rather than aria-hidden — this wraps the dialog.
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[420px] rounded-xl border border-border/60 bg-card shadow-2xl">
        <div className="border-b border-border/40 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-semibold text-foreground">Rename Symbol</p>
            <span
              className={cn(
                "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                lspReady
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground",
              )}
              title={
                lspReady
                  ? "Semantic rename via language server — only true references change"
                  : "Text rename — word-boundary find/replace across files"
              }
            >
              {lspReady ? "Semantic" : "Text"}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Rename <span className="font-mono text-foreground">{symbol}</span> across the workspace
          </p>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="rename-new-name" className="text-[10.5px] font-medium text-muted-foreground uppercase tracking-wider">New name</label>
            <input
              id="rename-new-name"
              ref={inputRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && isValid && !applying) void apply();
                if (e.key === "Escape") onClose();
              }}
              className="rounded border border-border/60 bg-muted/30 px-2.5 py-1.5 font-mono text-[13px] text-foreground outline-none focus:border-primary/60"
            />
          </div>

          <div className="rounded border border-border/30 bg-muted/10 p-2.5 text-[11px]">
            {loading ? (
              <span className="text-muted-foreground/60">Searching…</span>
            ) : error ? (
              <span className="text-destructive">{error}</span>
            ) : fileSummaries.length === 0 ? (
              <span className="text-muted-foreground/60">No occurrences found</span>
            ) : (
              <div className="flex flex-col gap-1">
                <p className="text-muted-foreground">
                  {totalOccurrences} occurrence{totalOccurrences !== 1 ? "s" : ""} in {fileSummaries.length} file{fileSummaries.length !== 1 ? "s" : ""}
                </p>
                {lspReady && (
                  <p className="text-[10px] text-primary/70">
                    Text preview — the language server renames only real
                    references.
                  </p>
                )}
                <div className="mt-1 flex flex-col gap-0.5 max-h-[120px] overflow-y-auto">
                  {fileSummaries.map(({ rel, count }) => (
                    <div key={rel} className="flex items-center justify-between gap-2">
                      <span className="font-mono text-foreground/70 truncate">{rel}</span>
                      <span className="shrink-0 text-muted-foreground/60">{count}×</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {done && (
            <div className="flex items-center gap-1.5 text-[11px] text-green-500">
              <HugeiconsIcon icon={CheckmarkCircle01Icon} size={12} strokeWidth={1.75} />
              Renamed successfully
            </div>
          )}

          {error && !loading && (
            <div className="flex items-center gap-1.5 text-[11px] text-destructive">
              <HugeiconsIcon icon={Alert02Icon} size={12} strokeWidth={1.75} />
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border/40 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border/60 px-3 py-1.5 text-[11.5px] text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!isValid || applying || loading || done}
            onClick={() => void apply()}
            className={cn(
              "rounded px-3 py-1.5 text-[11.5px] font-medium text-primary-foreground transition-colors",
              "bg-primary/90 hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {applying ? "Renaming…" : "Rename"}
          </button>
        </div>
      </div>
    </div>
  );
}
