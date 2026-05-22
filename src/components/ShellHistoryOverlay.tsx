import { cn } from "@/lib/utils";
import { writeToLeaf } from "@/modules/terminal";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";

type Props = {
  leafId: number;
  onClose: () => void;
};

function fuzzyMatch(cmd: string, q: string): boolean {
  if (!q) return true;
  const lower = cmd.toLowerCase();
  const qLower = q.toLowerCase();
  // Substring match first (fast path); could upgrade to fuzzy later.
  return lower.includes(qLower);
}

export function ShellHistoryOverlay({ leafId, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [filtered, setFiltered] = useState<string[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load history on mount.
  useEffect(() => {
    invoke<string[]>("read_shell_history")
      .then((entries) => {
        setHistory(entries);
        setFiltered(entries.slice(0, 100));
      })
      .catch(() => {});
  }, []);

  // Focus input on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Filter on query change.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setFiltered(history.slice(0, 100));
      setActiveIdx(0);
      return;
    }
    const matches = history.filter((cmd) => fuzzyMatch(cmd, q)).slice(0, 100);
    setFiltered(matches);
    setActiveIdx(0);
  }, [query, history]);

  // Scroll active item into view.
  useEffect(() => {
    const item = listRef.current?.children[activeIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const commit = (idx: number) => {
    const cmd = filtered[idx];
    if (cmd != null) {
      // Insert into the terminal (do not auto-submit — let user review/edit).
      writeToLeaf(leafId, cmd);
    }
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      commit(activeIdx);
      return;
    }
    // Tab: insert selected without closing (to allow further editing).
    if (e.key === "Tab") {
      e.preventDefault();
      const cmd = filtered[activeIdx];
      if (cmd != null) writeToLeaf(leafId, cmd);
      onClose();
      return;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative z-10 flex w-[600px] max-w-[90vw] flex-col overflow-hidden rounded-xl border border-border/60 bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2.5">
          <svg
            className="size-4 shrink-0 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.75}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search history…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            className="flex-1 bg-transparent font-mono text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/60"
          />
          <span className="text-[10.5px] text-muted-foreground/60">
            {filtered.length} results
          </span>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          className="max-h-[360px] overflow-y-auto overscroll-contain"
        >
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-[12px] text-muted-foreground">
              {history.length === 0
                ? "No shell history found"
                : "No matches"}
            </div>
          )}
          {filtered.map((cmd, idx) => (
            <button
              key={`${cmd}-${idx}`}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                commit(idx);
              }}
              onMouseEnter={() => setActiveIdx(idx)}
              className={cn(
                "flex w-full items-center px-3 py-1.5 text-left",
                idx === activeIdx
                  ? "bg-accent/60 text-foreground"
                  : "text-foreground hover:bg-muted/40",
              )}
            >
              <span className="block w-full truncate font-mono text-[12px]">
                {cmd}
              </span>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 border-t border-border/40 px-3 py-1.5 text-[10.5px] text-muted-foreground/70">
          <span><kbd className="font-mono">↵</kbd> insert</span>
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
