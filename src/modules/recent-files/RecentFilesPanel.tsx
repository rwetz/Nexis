// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { basename, displayDirname as dirpart } from "@/lib/path";
import { cn } from "@/lib/utils";
import { Cancel01Icon, File01Icon, Delete02Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRecentFiles } from "./useRecentFiles";

type Props = {
  onOpenFile: (path: string) => void;
};

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// ---------------------------------------------------------------------------
// Fuzzy match — returns { score, ranges } or null if no match.
// `ranges` is an array of [start, end) index pairs within `text` to highlight.
// Score: higher is better. Consecutive matches are rewarded.
// ---------------------------------------------------------------------------
type MatchResult = { score: number; ranges: [number, number][] };

function fuzzyMatch(text: string, query: string): MatchResult | null {
  if (!query) return { score: 0, ranges: [] };

  const t = text.toLowerCase();
  const q = query.toLowerCase();

  // Exact substring — highest priority
  const exactIdx = t.indexOf(q);
  if (exactIdx !== -1) {
    // prefer shorter texts; penalise match position so "readme" beats "ar" for query "r"
    return {
      score: 1000 + (text.length - q.length) - exactIdx * 5,
      ranges: [[exactIdx, exactIdx + q.length]],
    };
  }

  // Sequential fuzzy: each query char must appear in order in text
  const matchedIndices: number[] = [];
  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    let found = false;
    while (ti < t.length) {
      if (t[ti] === q[qi]) {
        matchedIndices.push(ti);
        ti++;
        found = true;
        break;
      }
      ti++;
    }
    if (!found) return null;
  }

  // Score: reward consecutive runs, penalise gaps
  let score = 0;
  let runLen = 1;
  for (let i = 1; i < matchedIndices.length; i++) {
    if (matchedIndices[i] === matchedIndices[i - 1] + 1) {
      runLen++;
      score += runLen * 10; // consecutive bonus grows
    } else {
      runLen = 1;
      score -= matchedIndices[i] - matchedIndices[i - 1]; // gap penalty
    }
  }
  // Reward match near the start
  score -= matchedIndices[0] * 2;

  // Collapse consecutive indices into ranges
  const ranges: [number, number][] = [];
  let start = matchedIndices[0];
  let prev = matchedIndices[0];
  for (let i = 1; i < matchedIndices.length; i++) {
    if (matchedIndices[i] === prev + 1) {
      prev = matchedIndices[i];
    } else {
      ranges.push([start, prev + 1]);
      start = matchedIndices[i];
      prev = matchedIndices[i];
    }
  }
  ranges.push([start, prev + 1]);

  return { score, ranges };
}

// Highlight a string with <mark> spans given [start,end) ranges
function Highlighted({ text, ranges }: { text: string; ranges: [number, number][] }) {
  if (ranges.length === 0) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const [s, e] of ranges) {
    if (s > cursor) parts.push(<span key={cursor}>{text.slice(cursor, s)}</span>);
    parts.push(
      <mark
        key={s}
        className="bg-transparent text-primary font-semibold not-italic"
      >
        {text.slice(s, e)}
      </mark>,
    );
    cursor = e;
  }
  if (cursor < text.length) parts.push(<span key={cursor}>{text.slice(cursor)}</span>);
  return <>{parts}</>;
}

// ---------------------------------------------------------------------------

type MatchedFile = {
  path: string;
  accessedAt: number;
  nameMatch: MatchResult;
  dirMatch: MatchResult | null;
};

export function RecentFilesPanel({ onOpenFile }: Props) {
  const files = useRecentFiles((s) => s.files);
  const remove = useRecentFiles((s) => s.remove);
  const clear = useRecentFiles((s) => s.clear);

  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  // Reset selection to 0 whenever the query changes (moved out of render body
  // to avoid calling setState during render, which causes extra re-renders).
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  const results = useMemo<MatchedFile[]>(() => {
    const q = query.trim();
    if (!q) {
      return files.map((f) => ({
        ...f,
        nameMatch: { score: 0, ranges: [] },
        dirMatch: null,
      }));
    }

    const matched: (MatchedFile & { _score: number })[] = [];
    for (const f of files) {
      const name = basename(f.path);
      const dir = dirpart(f.path);

      const nameMatch = fuzzyMatch(name, q);
      const dirMatch = fuzzyMatch(dir, q);

      if (!nameMatch && !dirMatch) continue;

      const score = Math.max(nameMatch?.score ?? -Infinity, (dirMatch?.score ?? -Infinity) - 50);

      matched.push({
        path: f.path,
        accessedAt: f.accessedAt,
        nameMatch: nameMatch ?? { score: 0, ranges: [] },
        dirMatch: dirMatch ?? null,
        _score: score,
      });
    }

    matched.sort((a, b) => b._score - a._score);
    return matched;
  }, [files, query]);

  // Clamp activeIdx when items are removed (e.g. via the × button) so that
  // Enter never fires onOpenFile(undefined) on a now-gone row.
  useEffect(() => {
    setActiveIdx((i) => (results.length === 0 ? 0 : Math.min(i, results.length - 1)));
  }, [results.length]);

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIdx]) {
      e.preventDefault();
      onOpenFile(results[activeIdx].path);
    } else if (e.key === "Escape") {
      setQuery("");
      inputRef.current?.blur();
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden text-[12px]">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 bg-gradient-to-r from-primary/[0.04] to-transparent px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Recent Files
        </span>
        {files.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Clear all"
          >
            <HugeiconsIcon icon={Delete02Icon} size={11} strokeWidth={1.75} />
            Clear
          </button>
        )}
      </div>

      {/* Search box */}
      {files.length > 0 && (
        <div className="relative shrink-0 border-b border-border/40 px-2 py-1.5">
          <HugeiconsIcon
            icon={Search01Icon}
            size={11}
            strokeWidth={1.75}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/50"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            aria-label="Filter recent files"
            placeholder="Filter files…"
            spellCheck={false}
            className={cn(
              "w-full rounded-md bg-muted/40 py-1 pl-6 pr-2 text-[11px]",
              "text-foreground placeholder:text-muted-foreground/40",
              "outline-none focus:ring-1 focus:ring-primary/40",
              "border border-transparent focus:border-border/60",
              "transition-colors duration-150",
            )}
          />
        </div>
      )}

      {/* List */}
      {results.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-[11px] text-muted-foreground/60">
          {query ? "No matching files" : "No recent files"}
        </div>
      ) : (
        <div className="nexis-scrollbar flex-1 overflow-y-auto">
          {results.map((f, idx) => {
            const name = basename(f.path);
            const dir = dirpart(f.path);
            const isActive = idx === activeIdx;
            return (
              // Plain row: it carries a Remove control, so the row itself must
              // not be a control (nor an ARIA `option`, whose children are
              // presentational) or Remove becomes unreachable. Opening is its
              // own button filling the row; arrow-key navigation still runs
              // through the filter input above.
              <div
                key={f.path}
                className={cn(
                  "group flex items-center gap-2 px-3 py-1.5",
                  isActive ? "bg-muted/70" : "hover:bg-muted/50",
                )}
                onMouseEnter={() => setActiveIdx(idx)}
              >
                <button
                  type="button"
                  onClick={() => onOpenFile(f.path)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                >
                  <HugeiconsIcon
                    icon={File01Icon}
                    size={13}
                    strokeWidth={1.75}
                    className="shrink-0 text-muted-foreground/60"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-foreground">
                      <Highlighted text={name} ranges={f.nameMatch.ranges} />
                    </div>
                    {dir && (
                      <div className="truncate text-[10.5px] text-muted-foreground/60">
                        {f.dirMatch ? (
                          <Highlighted text={dir} ranges={f.dirMatch.ranges} />
                        ) : (
                          dir
                        )}
                      </div>
                    )}
                  </div>
                </button>
                <span className={cn(
                  "shrink-0 text-[10px] text-muted-foreground/50",
                  isActive ? "hidden" : "group-hover:hidden",
                )}>
                  {relativeTime(f.accessedAt)}
                </span>
                <button
                  type="button"
                  onClick={() => remove(f.path)}
                  aria-label={`Remove ${name} from recent files`}
                  className={cn(
                    "shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:flex",
                    isActive ? "flex" : "hidden group-hover:flex",
                  )}
                  title="Remove from recent"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
