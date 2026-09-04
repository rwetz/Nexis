// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Command history overlay (Ctrl-R style), over two sources.
 *
 * **Shell history** is every shell's history file, parsed, deduplicated and
 * substring-filtered on the Rust side by `search_shell_history` — the payload
 * stays small regardless of history size, instead of shipping up to 10,000
 * entries into JS and filtering there on every keystroke.
 *
 * **Succeeded here** is the command ledger, filtered to exit code 0 and to
 * the open workspace. This is ROADMAP's *success-filtered history*, and it is
 * the query you always actually want: no shell's history file records whether
 * a command **worked**, so "the docker command that succeeded in this repo" is
 * unanswerable from `~/.zsh_history` no matter how good the fuzzy match is.
 * Both facts it needs — the exit code and the per-workspace scope — exist only
 * because the ledger kept them. The source is off unless recording is on, and
 * the toggle says so rather than showing an empty list.
 *
 * Queries are debounced at 120 ms so we don't hammer the IPC channel while
 * the user is typing quickly.
 */
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { formatDuration, relativeTime } from "@/lib/format";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { writeToLeaf } from "@/modules/terminal";
import {
  currentLedgerWorkspaceRoot,
  queryLedger,
} from "@/modules/terminal/lib/ledger";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState, useCallback } from "react";

const INITIAL_LIMIT = 200;   // entries shown before a search is typed
const SEARCH_LIMIT  = 100;   // entries returned per search query
const DEBOUNCE_MS   = 120;   // query debounce window

type Props = {
  leafId: number;
  onClose: () => void;
};

/** Which store the rows came from. */
type Source = "shell" | "ledger";

/**
 * One row, whichever source produced it. The shell file has nothing but the
 * command line; the ledger adds what it alone knows.
 */
type Row = { command: string; meta: string | null };

/** "12s · 3h ago" — the ledger's added value, in the width of a timestamp. */
function ledgerMeta(durationMs: number, startedAt: number): string {
  const when = relativeTime(startedAt);
  // Sub-second commands report no duration: "0s" next to every `cd` is noise,
  // and the number only earns its place once it is worth noticing.
  return durationMs >= 1000
    ? `${formatDuration(Math.round(durationMs / 1000))} · ${when}`
    : when;
}

/**
 * Runs the query against whichever source is selected.
 *
 * The source is a dependency of the search rather than of a second hook, so
 * flipping it re-runs the *current* query immediately — a toggle that made you
 * retype what you had already typed would not be worth pressing.
 */
function useSearchHistory(source: Source, workspaceRoot: string | null) {
  const [results, setResults] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Every response carries the request that produced it, so a slow answer for
  // an abandoned query or a switched-away source cannot overwrite a newer one.
  const seqRef = useRef(0);

  const run = useCallback(
    (query: string, limit: number) => {
      const seq = ++seqRef.current;
      const settle = (rows: Row[] | null) => {
        if (seq !== seqRef.current) return;
        if (rows === null) {
          setError(true);
        } else {
          setResults(rows);
          setError(false);
        }
        setLoading(false);
      };

      if (source === "ledger") {
        void queryLedger(workspaceRoot, {
          query,
          exit: "success",
          dedupe: true,
          limit,
        })
          .then((records) =>
            settle(
              records.map((r) => ({
                command: r.argv,
                meta: ledgerMeta(r.durationMs, r.startedAt),
              })),
            ),
          )
          .catch(() => settle(null));
        return;
      }

      void invoke<string[]>("search_shell_history", { query, limit })
        .then((entries) =>
          settle(entries.map((command) => ({ command, meta: null }))),
        )
        .catch(() => settle(null));
    },
    [source, workspaceRoot],
  );

  const searchDebounced = useCallback(
    (query: string) => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      // Show "…" immediately so the badge doesn't show stale counts while
      // waiting for the debounced call to fire and return.
      setLoading(true);
      timerRef.current = setTimeout(
        () => run(query, query === "" ? INITIAL_LIMIT : SEARCH_LIMIT),
        DEBOUNCE_MS,
      );
    },
    [run],
  );

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  return { results, loading, error, searchDebounced };
}

export function ShellHistoryOverlay({ leafId, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<Source>("shell");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // The ledger source needs both halves of its own promise: something must
  // have been recorded, and there must be a workspace to scope it to. Read
  // once — neither can change while this overlay is open.
  const ledgerEnabled = usePreferencesStore((s) => s.commandLedgerEnabled);
  const [workspaceRoot] = useState(() => currentLedgerWorkspaceRoot());
  const ledgerAvailable = ledgerEnabled && workspaceRoot !== null;

  const { results, loading, error, searchDebounced } = useSearchHistory(
    source,
    workspaceRoot,
  );

  // Focus input on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Re-run whenever the query *or* the source changes, so flipping the toggle
  // answers the question already typed rather than clearing it.
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
    const row = results[idx];
    if (row != null) {
      // Insert into terminal — do NOT auto-submit; let the user review / edit.
      writeToLeaf(leafId, row.command);
    }
    onClose();
  };

  // Ctrl+R opens this overlay from the terminal; pressing it again once the
  // overlay has focus cycles the source, which is the idiom every other
  // history picker uses and costs no new binding.
  const toggleSource = () => {
    if (!ledgerAvailable) return;
    setSource((s) => (s === "shell" ? "ledger" : "shell"));
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "r" && e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      toggleSource();
      return;
    }
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
      case "Tab": {
        // Insert selected command without closing so the user can keep editing.
        e.preventDefault();
        const row = results[activeIdx];
        if (row != null) writeToLeaf(leafId, row.command);
        onClose();
        return;
      }
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
          <Icon
            name="clock"
            size="sm"
            className="shrink-0 text-muted-foreground"
          />
          <input
            ref={inputRef}
            type="text"
            aria-label={
              source === "ledger"
                ? "Search commands that succeeded here"
                : "Search shell history"
            }
            placeholder={
              source === "ledger"
                ? "Search commands that worked here…"
                : "Search history…"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            className="flex-1 bg-transparent font-mono text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/60"
          />
          <span className="text-[10.5px] text-muted-foreground/60">
            {loading ? "…" : `${results.length} results`}
          </span>
        </div>

        {/* Source toggle. Rendered even when the ledger is unavailable, with
            the reason on it: a control that silently disappears teaches the
            user nothing, and this one is the only place the feature is
            discoverable from. */}
        <div className="flex items-center gap-1 border-b border-border/40 px-2.5 py-1.5">
          {(
            [
              ["shell", "Shell history"],
              ["ledger", "Succeeded here"],
            ] as const
          ).map(([id, label]) => {
            const active = source === id;
            const disabled = id === "ledger" && !ledgerAvailable;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                disabled={disabled}
                title={
                  disabled
                    ? workspaceRoot === null
                      ? "Open a folder to search commands recorded in it"
                      : "Turn on command recording in Settings > Privacy"
                    : undefined
                }
                onMouseDown={(e) => {
                  // Keep focus in the input: the toggle is a detour, not a
                  // destination, and losing the caret would cost a click back.
                  e.preventDefault();
                  setSource(id);
                }}
                className={cn(
                  "rounded-md px-2 py-0.5 text-[11px] transition-colors",
                  active
                    ? "bg-accent/70 text-foreground"
                    : "text-muted-foreground hover:bg-muted/40",
                  disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
                )}
              >
                {label}
              </button>
            );
          })}
          <span className="ml-auto pr-1 text-[10px] text-muted-foreground/60">
            {source === "ledger"
              ? "exit 0, this workspace"
              : ledgerAvailable
                ? "Ctrl+R switches"
                : null}
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
                ? "Could not load history"
                : query.trim()
                  ? "No matches"
                  : source === "ledger"
                    ? "Nothing recorded here yet — commands appear once they finish"
                    : "No shell history found"}
            </div>
          )}
          {results.map((row, idx) => (
            <button
              key={`${row.command}-${idx}`}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                commit(idx);
              }}
              onMouseEnter={() => setActiveIdx(idx)}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-1.5 text-left",
                idx === activeIdx
                  ? "bg-accent/60 text-foreground"
                  : "text-foreground hover:bg-muted/40",
              )}
            >
              <span className="min-w-0 flex-1 truncate font-mono text-[12px]">
                {row.command}
              </span>
              {row.meta ? (
                <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground/70">
                  {row.meta}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Footer hints */}
        <div className="flex items-center gap-4 border-t border-border/40 px-3 py-1.5 text-[10.5px] text-muted-foreground/70">
          <span><kbd className="font-mono">↵</kbd> insert</span>
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">Esc</kbd> close</span>
          {ledgerAvailable ? (
            <span className="ml-auto">
              <kbd className="font-mono">Ctrl+R</kbd> source
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
