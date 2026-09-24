// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The global fuzzy finder, in the shape of macOS Spotlight: one centred
 * field, results grouped by kind, and a preview of the highlighted result
 * alongside them.
 *
 * This replaces the plain "Go to file" list. Two things changed beyond the
 * look. It ranks with a subsequence scorer rather than a substring
 * `includes`, so "mtx" finds `modules/terminal/index.ts`; and it searches
 * commands as well as files, because a finder the user reaches for by reflex
 * should answer "open settings" as readily as it answers a filename.
 *
 * Kept deliberately: the derive-during-render discipline the old picker had.
 * Results are a pure function of the query and the loaded file set, and the
 * highlight index is reconciled during render rather than in an effect, so
 * there is never a painted frame where the highlight points into the
 * previous query's results.
 */

import { Icon, type IconName } from "@/components/icon";
import { basename, displayDirname as dirname } from "@/lib/path";
import { cn } from "@/lib/utils";
import { filesystem } from "@/platform/filesystem";
import { m, useReducedMotion } from "motion/react";
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CommandDef } from "./CommandPalette";

/** Max results rendered. Beyond this the list stops being scannable. */
const MAX_RESULTS = 40;
/** Files pulled from the workspace for client-side matching. */
const FILE_SCAN_LIMIT = 3000;

type Result =
  | {
      kind: "file";
      id: string;
      title: string;
      subtitle: string;
      path: string;
      score: number;
    }
  | {
      kind: "command";
      id: string;
      title: string;
      subtitle: string;
      icon: IconName;
      run: () => void;
      score: number;
    };

/**
 * Is `query` a subsequence of `text`? Case-insensitive.
 *
 * The gate in front of `fuzzyScore`. Scoring allocates and branches per
 * character; this is one indexOf walk that bails on the first miss, and on a
 * short query it rejects most of the file list before any of that runs.
 */
function isSubsequence(text: string, query: string): boolean {
  let ti = 0;
  for (let qi = 0; qi < query.length; qi++) {
    ti = text.indexOf(query[qi], ti);
    if (ti === -1) return false;
    ti++;
  }
  return true;
}

/**
 * Subsequence match with contiguity and word-boundary bonuses.
 *
 * Returns a score, higher is better, or -1 when `query` is not a subsequence
 * of `text` at all. The bonuses are what make this feel like a fuzzy finder
 * rather than a filter: without them, every subsequence hit ties and the
 * results order by path length, which buries the file whose *name* matched
 * under every short path that happened to contain the letters.
 */
function fuzzyScore(text: string, query: string): number {
  if (!query) return 0;
  const hay = text.toLowerCase();
  const needle = query.toLowerCase();

  let score = 0;
  let ti = 0;
  let prevMatch = -2;
  for (let qi = 0; qi < needle.length; qi++) {
    const ch = needle[qi];
    const found = hay.indexOf(ch, ti);
    if (found === -1) return -1;

    // Adjacent to the previous match: the run is contiguous, which is the
    // strongest signal that this is the match the user meant.
    if (found === prevMatch + 1) score += 8;
    // Start of the string, or just after a separator: a word boundary.
    const before = found === 0 ? "/" : hay[found - 1];
    if (found === 0 || before === "/" || before === "-" || before === "_" || before === ".") {
      score += 6;
    }
    // Everything else still counts, but earlier is better.
    score += Math.max(0, 4 - Math.floor((found - ti) / 8));

    prevMatch = found;
    ti = found + 1;
  }
  // Prefer shorter haystacks among otherwise equal matches, so an exact-ish
  // hit is not beaten by a long path that merely contains the letters.
  return score - Math.min(20, Math.floor(hay.length / 12));
}

/**
 * One result row.
 *
 * Memoized because `onMouseEnter` moves the selection, which re-renders the
 * list: without this, sweeping the pointer down forty rows re-rendered forty
 * rows on every step. `onCommit`/`onHover` are stable identities from the
 * parent, so only the two rows whose `selected` actually changed repaint.
 */
const SpotlightRow = memo(function SpotlightRow({
  hit,
  idx,
  selected,
  onCommit,
  onHover,
}: {
  hit: Result;
  idx: number;
  selected: boolean;
  onCommit: (idx: number) => void;
  onHover: (idx: number) => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onMouseDown={(e) => {
        e.preventDefault();
        onCommit(idx);
      }}
      onMouseEnter={() => onHover(idx)}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left",
        selected ? "bg-accent text-accent-foreground" : "text-foreground",
      )}
    >
      <Icon
        name={hit.kind === "command" ? hit.icon : "file"}
        size="sm"
        className="shrink-0 text-muted-foreground"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium">
          {hit.title}
        </span>
        {hit.subtitle && (
          <span className="block truncate text-[10.5px] text-muted-foreground">
            {hit.subtitle}
          </span>
        )}
      </span>
    </button>
  );
});

type Props = {
  root: string | null;
  onSelect: (path: string) => void;
  onClose: () => void;
  /** Commands to search alongside files. Omit for a files-only finder. */
  commands?: CommandDef[];
};

export function AppleSpotlight({ root, onSelect, onClose, commands }: Props) {
  const [query, setQuery] = useState("");
  // The field updates on every keystroke; the list is allowed to lag behind
  // it. Without this, ranking several thousand paths runs synchronously
  // inside the keystroke and the caret visibly stutters on a large workspace.
  const deferredQuery = useDeferredValue(query);
  const [allFiles, setAllFiles] = useState<string[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!root) return;
    setLoading(true);
    filesystem
      .listFiles(root, { limit: FILE_SCAN_LIMIT, maxDepth: 10, showHidden: false })
      .then((res) => {
        setAllFiles(res.files);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [root]);

  const results = useMemo<Result[]>(() => {
    const q = deferredQuery.trim();

    // Empty query: the recent shape of the workspace, not a ranked list.
    if (!q) {
      return allFiles.slice(0, MAX_RESULTS).map((rel) => ({
        kind: "file" as const,
        id: rel,
        title: basename(rel),
        subtitle: dirname(rel),
        path: root ? `${root}/${rel}` : rel,
        score: 0,
      }));
    }

    const needle = q.toLowerCase();

    // Keep only the best MAX_RESULTS as we go, rather than building an object
    // per match and sorting the lot. On a one-character query nearly every
    // path matches, so the naive form allocated thousands of objects and
    // sorted them to throw all but forty away — on every keystroke.
    const best: Result[] = [];
    let worst = -Infinity;

    const offer = (make: () => Result, score: number) => {
      if (best.length >= MAX_RESULTS && score <= worst) return;
      best.push(make());
      // Only re-sort once the pool is over capacity; below that the list is
      // short and the final sort handles ordering anyway.
      if (best.length > MAX_RESULTS) {
        best.sort((a, b) => b.score - a.score);
        best.length = MAX_RESULTS;
        worst = best[best.length - 1].score;
      }
    };

    if (root) {
      for (const rel of allFiles) {
        const lower = rel.toLowerCase();
        // One cheap walk rejects the whole path before any scoring. If the
        // query is not even a subsequence of the full path, it cannot be one
        // of the basename either.
        if (!isSubsequence(lower, needle)) continue;

        const name = basename(rel);
        // Score the basename first and only fall back to the full path: a
        // query that names a file should not be penalised for the
        // directories above it, and the second scan is skipped whenever the
        // first already matched.
        const nameScore = isSubsequence(name.toLowerCase(), needle)
          ? fuzzyScore(name, q) + 12
          : -1;
        const score = nameScore >= 0 ? nameScore : fuzzyScore(rel, q);
        if (score < 0) continue;

        offer(
          () => ({
            kind: "file",
            id: rel,
            title: name,
            subtitle: dirname(rel),
            path: `${root}/${rel}`,
            score,
          }),
          score,
        );
      }
    }

    for (const cmd of commands ?? []) {
      const haystack = [cmd.label, cmd.category, ...(cmd.keywords ?? [])].join(" ");
      if (!isSubsequence(haystack.toLowerCase(), needle)) continue;
      const score = fuzzyScore(haystack, q);
      if (score < 0) continue;
      offer(
        () => ({
          kind: "command",
          id: cmd.id,
          title: cmd.label,
          subtitle: cmd.description ?? cmd.category,
          icon: cmd.icon ?? "keyboard",
          // Commands outrank files on an equal score: when the user types
          // something that reads like an instruction, they meant the action.
          score: score + 10,
          run: cmd.action,
        }),
        score + 10,
      );
    }

    best.sort((a, b) => b.score - a.score || a.title.length - b.title.length);
    return best.slice(0, MAX_RESULTS);
  }, [deferredQuery, allFiles, root, commands]);

  // Reconciled during render: the highlight belongs to the current list, so
  // rebuilding the list resets it with no intermediate painted frame.
  const [resultsForActive, setResultsForActive] = useState(results);
  if (results !== resultsForActive) {
    setResultsForActive(results);
    setActiveIdx(0);
  }

  useEffect(() => {
    const item = listRef.current?.children[activeIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const active = results[activeIdx];

  // Stable identity, so the memoized rows actually skip re-rendering — a
  // fresh closure here would defeat SpotlightRow's memo on every keystroke.
  const commit = useCallback(
    (idx: number) => {
      const hit = results[idx];
      if (!hit) return;
      if (hit.kind === "file") onSelect(hit.path);
      else hit.run();
      onClose();
    },
    [results, onSelect, onClose],
  );

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
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
    }
  };

  return (
    <div
      // Click-outside catcher. `presentation` (not aria-hidden — that would
      // hide the dialog it wraps) drops the element's own semantics without
      // touching its descendants; Escape is the keyboard equivalent.
      role="presentation"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[16vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <m.div
        aria-hidden="true"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.14 }}
        onClick={onClose}
      />

      <m.div
        role="dialog"
        aria-modal="true"
        aria-label="Spotlight"
        className="relative z-10 flex w-[680px] max-w-[92vw] flex-col overflow-hidden rounded-2xl border border-border/60 bg-popover/95 shadow-2xl ring-1 ring-foreground/5 backdrop-blur-xl"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.97, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { type: "spring", stiffness: 420, damping: 32 }
        }
      >
        {/* Query field. Oversized on purpose — it is the one thing on screen
            and the only thing the user is expected to touch. */}
        <div className="flex items-center gap-3 px-4 py-3">
          <Icon name="search" size="lg" className="shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            aria-label="Search files and commands"
            placeholder={root ? "Spotlight Search" : "No workspace open"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            className="flex-1 bg-transparent text-[17px] text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          {loading && (
            <span className="shrink-0 text-[11px] text-muted-foreground">
              Indexing
            </span>
          )}
        </div>

        {results.length > 0 && (
          <div className="flex min-h-0 border-t border-border/60">
            <div
              ref={listRef}
              role="listbox"
              aria-label="Results"
              className="max-h-[42vh] min-w-0 flex-1 overflow-y-auto overscroll-contain p-1.5"
            >
              {results.map((hit, idx) => (
                <SpotlightRow
                  key={`${hit.kind}:${hit.id}`}
                  hit={hit}
                  idx={idx}
                  selected={idx === activeIdx}
                  onCommit={commit}
                  onHover={setActiveIdx}
                />
              ))}
            </div>

            {/* Preview. Spotlight's defining half: the list answers "which
                one", this answers "is it the one".

                Deliberately NOT animated. The first version keyed a
                motion.div on the active result inside `AnimatePresence
                mode="wait"`, which waits for the outgoing panel's exit to
                finish before the incoming one starts — so dragging the
                pointer down the list left the preview visibly chasing the
                cursor, one result behind. A pane that answers "what am I
                hovering" has to be synchronous with the hover. */}
            {active && (
              <div className="hidden w-[240px] shrink-0 flex-col items-center justify-center gap-3 border-l border-border/60 p-5 text-center sm:flex">
                <Icon
                  name={active.kind === "command" ? active.icon : "file-code"}
                  size="xl"
                  className="text-muted-foreground"
                />
                <span className="w-full truncate text-[12.5px] font-medium">
                  {active.title}
                </span>
                <span className="w-full text-[10.5px] leading-snug break-words text-muted-foreground">
                  {active.kind === "command" ? active.subtitle : active.path}
                </span>
                <span className="text-[10px] tracking-wide text-muted-foreground/70 uppercase">
                  {active.kind === "command" ? "Command" : "File"}
                </span>
              </div>
            )}
          </div>
        )}

        {results.length === 0 && !loading && (
          <div className="border-t border-border/60 px-4 py-8 text-center text-[12px] text-muted-foreground">
            {root ? "No results" : "No workspace open"}
          </div>
        )}
      </m.div>
    </div>
  );
}
