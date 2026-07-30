// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Shell history overlay (Ctrl-R style).
 *
 * Performance improvement: instead of loading the full history into JS
 * (up to 10 000 entries) and filtering client-side on every keystroke, we
 * call `search_shell_history` on the Rust side.  Rust parses all history
 * files, deduplicates, filters with a substring match, and returns only the
 * matching `limit` entries — keeping the IPC payload small regardless of
 * history size.
 *
 * Queries are debounced at 120 ms so we don't hammer the IPC channel while
 * the user is typing quickly.
 */
import { cn } from "@/lib/utils";
import { writeToLeaf } from "@/modules/terminal";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState, useCallback } from "react";

const INITIAL_LIMIT = 200;   // entries shown before a search is typed
const SEARCH_LIMIT  = 100;   // entries returned per search query
const DEBOUNCE_MS   = 120;   // query debounce window

type Props = {
  leafId: number;
  onClose: () => void;
};

function useSearchHistory() {
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fire an immediate search (no debounce) — used for the initial empty-query load.
  const searchNow = useCallback((query: string, limit: number) => {
    invoke<string[]>("search_shell_history", { query, limit })
      .then((entries) => {
        setResults(entries);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  // Debounced version for query changes while the user is typing.
  const searchDebounced = useCallback((query: string) => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    // Show "…" immediately so the badge doesn't show stale counts while
    // waiting for the debounced Rust call to fire and return.
    setLoading(true);
    timerRef.current = setTimeout(() => {
      void invoke<string[]>("search_shell_history", {
        query,
        limit: SEARCH_LIMIT,
      })
        .then((entries) => {
          setResults(entries);
          setError(false);
        })
        .catch(() => setError(true))
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
  }, []);

  // Load initial results on mount.
  useEffect(() => {
    searchNow("", INITIAL_LIMIT);
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [searchNow]);

  return { results, loading, error, searchDebounced };
}

export function ShellHistoryOverlay({ leafId, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { results, loading, error, searchDebounced } = useSearchHistory();

  // Focus input on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Trigger server-side search whenever query changes.
  useEffect(() => {
    setActiveIdx(0);
    searchDebounced(query.trim());
  }, [query, searchDebounced]);

  // Scroll active item into view.
  useEffect(() => {
    const item = listRef.current?.children[activeIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const commit = (idx: number) => {
    const cmd = results[idx];
    if (cmd != null) {
      // Insert into terminal — do NOT auto-submit; let the user review / edit.
      writeToLeaf(leafId, cmd);
    }
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "Escape":
        onClose();
        return;
      case "ArrowDown":
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, results.length - 1));
        return;
      case "ArrowUp":
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
        return;
      case "Enter":
        e.preventDefault();
        commit(activeIdx);
        return;
      case "Tab":
        // Insert selected command without closing so the user can keep editing.
        e.preventDefault();
        if (results[activeIdx] != null) writeToLeaf(leafId, results[activeIdx]);
        onClose();
        return;
    }
  };

  const isEmpty = !loading && results.length === 0;

  return (
    <div
      // Click-outside catcher. `presentation` (not aria-hidden — that would
      // hide the dialog it wraps) drops the element's own semantics without
      // touching its descendants; Escape is the keyboard equivalent.
      role="presentation"
      className="fixed inset-0 z-50 flex items-start justify-center pt-24"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop — decorative dimming layer. Click-to-dismiss is a mouse
          convenience only; keyboard users close with Escape (handled above),
          so this is hidden from assistive tech rather than made a tab stop. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      <div className="relative z-10 flex w-[600px] max-w-[90vw] flex-col overflow-hidden rounded-xl border border-border/60 bg-background shadow-2xl">
        {/* Search input */}
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
            aria-label="Search shell history"
            placeholder="Search history…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            className="flex-1 bg-transparent font-mono text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/60"
          />
          <span className="text-[10.5px] text-muted-foreground/60">
            {loading ? "…" : `${results.length} results`}
          </span>
        </div>

        {/* Results list */}
        <div
          ref={listRef}
          className="max-h-[360px] overflow-y-auto overscroll-contain"
        >
          {isEmpty && (
            <div className="px-4 py-6 text-center text-[12px] text-muted-foreground">
              {error
                ? "Could not load shell history"
                : query.trim()
                  ? "No matches"
                  : "No shell history found"}
            </div>
          )}
          {results.map((cmd, idx) => (
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

        {/* Footer hints */}
        <div className="flex items-center gap-4 border-t border-border/40 px-3 py-1.5 text-[10.5px] text-muted-foreground/70">
          <span><kbd className="font-mono">↵</kbd> insert</span>
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
