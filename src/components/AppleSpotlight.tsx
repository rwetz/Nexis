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
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { FileTypeIcon } from "@/modules/explorer/lib/FileTypeIcon";
import { useRecentFiles } from "@/modules/recent-files/useRecentFiles";
import { Kbd } from "@/components/ui/kbd";
import { SpotlightPreview, type PreviewTarget } from "./spotlight/SpotlightPreview";
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
/** Rows shown under the bar before anything is typed. */
const RESTING_RESULTS = 6;
/** The bar at rest, and once it has results to show beside a preview. */
const WIDTH_RESTING = 560;
const WIDTH_EXPANDED = 800;

/**
 * Cycled in the empty field. They teach what this finder does that a file
 * list does not: commands, and subsequence matching.
 */
const HINTS = [
  "Search files and commands",
  "Try \u201cmtx\u201d for modules/terminal/index.ts",
  "Type a command, like \u201ctoggle theme\u201d",
  "Jump to any file in the workspace",
];

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
      category: string;
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

/** A recent file's directory, relative to the workspace when it is inside it. */
function relativeToRoot(path: string, root: string | null): string {
  const norm = path.replace(/\\/g, "/");
  const base = root?.replace(/\\/g, "/").replace(/\/$/, "");
  if (base && norm.startsWith(`${base}/`)) return dirname(norm.slice(base.length + 1));
  return dirname(norm);
}

/**
 * The field's placeholder, cycling through HINTS while the field is empty.
 * Drawn over the input rather than as its placeholder attribute, so it can
 * slide.
 */
function RotatingHint({ reduceMotion }: { reduceMotion: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduceMotion) return;
    const id = window.setInterval(() => setI((n) => (n + 1) % HINTS.length), 3200);
    return () => window.clearInterval(id);
  }, [reduceMotion]);
  return (
    <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 flex items-center overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <m.span
          key={i}
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -14, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className="whitespace-nowrap text-[17px] text-muted-foreground/50"
        >
          {HINTS[i]}
        </m.span>
      </AnimatePresence>
    </span>
  );
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
      {hit.kind === "command" ? (
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background">
          <Icon name={hit.icon} size="sm" className="text-muted-foreground" />
        </span>
      ) : (
        <span className="flex size-6 shrink-0 items-center justify-center">
          <FileTypeIcon name={hit.title} className="size-4" />
        </span>
      )}
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

type Spring = { duration: number } | { type: "spring"; stiffness: number; damping: number };

/**
 * The icon answers "is it working": a magnifier at rest, a turning ring while
 * the workspace is indexed, tinted once there is a query.
 */
function SearchGlyph({ loading, expanded, spring }: { loading: boolean; expanded: boolean; spring: Spring }) {
  return (
    <span className="relative flex size-5 shrink-0 items-center justify-center">
      <AnimatePresence mode="popLayout" initial={false}>
        {loading ? (
          <m.span
            key="loading"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary"
          />
        ) : (
          <m.span
            key="search"
            initial={{ opacity: 0, scale: 0.6, rotate: -30 }}
            animate={{ opacity: 1, scale: expanded ? 1.08 : 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={spring}
            className={cn("flex", expanded ? "text-primary" : "text-muted-foreground")}
          >
            <Icon name="search" size="lg" />
          </m.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/** "3 files · 2 commands", re-entering whenever either count changes. */
function CountBadge({ files, commands, spring }: { files: number; commands: number; spring: Spring }) {
  const parts = [
    files > 0 ? `${files} file${files === 1 ? "" : "s"}` : null,
    commands > 0 ? `${commands} command${commands === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  return (
    <AnimatePresence initial={false}>
      {parts.length > 0 ? (
        <m.span
          key={`${files}:${commands}`}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={spring}
          className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10.5px] tabular-nums text-muted-foreground"
        >
          {parts.join(" · ")}
        </m.span>
      ) : null}
    </AnimatePresence>
  );
}

function KeyHints() {
  return (
    <div className="flex items-center gap-3 border-t border-border/60 px-4 py-1.5 text-[10.5px] text-muted-foreground">
      <span className="flex items-center gap-1">
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd>
        Navigate
      </span>
      <span className="flex items-center gap-1">
        <Kbd>↵</Kbd>
        Open
      </span>
      <span className="flex items-center gap-1">
        <Kbd>Esc</Kbd>
        Close
      </span>
    </div>
  );
}

/**
 * The ranked results for a query: recent files at rest, otherwise the best
 * MAX_RESULTS files and commands by fuzzy score. A pure function of its
 * inputs, which is what lets the component reconcile the highlight during
 * render.
 */
function useSpotlightResults(
  deferredQuery: string,
  allFiles: string[],
  root: string | null,
  commands: CommandDef[] | undefined,
  recentFiles: { path: string }[],
): Result[] {
  return useMemo<Result[]>(() => {
    const q = deferredQuery.trim();

    // Empty query: what you were just working on, falling back to the top
    // of the workspace when there is no history yet. Short on purpose: the
    // bar is at rest and the list is a shortcut, not a browser.
    if (!q) {
      const recent = recentFiles.slice(0, RESTING_RESULTS).map((f) => ({
        kind: "file" as const,
        id: f.path,
        title: basename(f.path),
        subtitle: relativeToRoot(f.path, root),
        path: f.path,
        score: 0,
      }));
      if (recent.length > 0) return recent;
      return allFiles.slice(0, RESTING_RESULTS).map((rel) => ({
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
          category: cmd.category,
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
  }, [deferredQuery, allFiles, root, commands, recentFiles]);
}

/** The workspace's files for client-side matching, and whether they are loading. */
function useWorkspaceFiles(root: string | null): { files: string[]; loading: boolean } {
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!root) return;
    setLoading(true);
    filesystem
      .listFiles(root, { limit: FILE_SCAN_LIMIT, maxDepth: 10, showHidden: false })
      .then((res) => {
        setFiles(res.files);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [root]);
  return { files, loading };
}

/** What the preview pane shows for a result. */
function previewTargetFor(hit: Result): PreviewTarget {
  return hit.kind === "file"
    ? { kind: "file", path: hit.path, title: hit.title, subtitle: hit.subtitle }
    : { kind: "command", title: hit.title, subtitle: hit.subtitle, icon: hit.icon, category: hit.category };
}

type KeyAction = "close" | "down" | "up" | "commit" | null;

/** The finder's keys, as an action; the component applies it. */
function keyAction(key: string): KeyAction {
  switch (key) {
    case "Escape":
      return "close";
    case "ArrowDown":
      return "down";
    case "ArrowUp":
      return "up";
    case "Enter":
      return "commit";
    default:
      return null;
  }
}

/**
 * Everything under the query field: the result list (with a "Recent" label at
 * rest), the preview beside it once there is a query, or the empty state.
 */
function ResultsPane({
  results,
  activeIdx,
  expanded,
  loading,
  hasRoot,
  hasRecent,
  listRef,
  onCommit,
  onHover,
}: {
  results: Result[];
  activeIdx: number;
  expanded: boolean;
  loading: boolean;
  hasRoot: boolean;
  hasRecent: boolean;
  listRef: React.RefObject<HTMLDivElement | null>;
  onCommit: (idx: number) => void;
  onHover: (idx: number) => void;
}) {
  if (results.length === 0) {
    if (loading || !expanded) return null;
    return (
      <div className="border-t border-border/60 px-4 py-8 text-center text-[12px] text-muted-foreground">
        {hasRoot ? "No results" : "No workspace open"}
      </div>
    );
  }
  const active = results[activeIdx];
  return (
    <div className="flex min-h-0 border-t border-border/60">
      <div className="flex min-w-0 flex-1 flex-col">
        {!expanded ? (
          <div className="px-4 pt-2 text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">
            {hasRecent ? "Recent" : "In this workspace"}
          </div>
        ) : null}
        <div
          ref={listRef}
          role="listbox"
          aria-label="Results"
          className={cn(
            "min-w-0 flex-1 overflow-y-auto overscroll-contain p-1.5",
            expanded ? "max-h-[46vh]" : "max-h-[30vh]",
          )}
        >
          {results.map((hit, idx) => (
            <SpotlightRow
              key={`${hit.kind}:${hit.id}`}
              hit={hit}
              idx={idx}
              selected={idx === activeIdx}
              onCommit={onCommit}
              onHover={onHover}
            />
          ))}
        </div>
      </div>

      {/* Preview. Spotlight's defining half: the list answers "which one",
          this answers "is it the one". Only once there is a query: at rest
          the bar stays a compact pill.

          The pane is NOT animated between results. The first version keyed a
          motion.div on the active result inside `AnimatePresence
          mode="wait"`, which waits for the outgoing panel's exit before the
          incoming one starts, so dragging the pointer down the list left the
          preview visibly chasing the cursor. A pane that answers "what am I
          hovering" has to be synchronous with the hover. */}
      {expanded && active ? (
        <div className="hidden w-[300px] shrink-0 border-l border-border/60 sm:block">
          <SpotlightPreview target={previewTargetFor(active)} />
        </div>
      ) : null}
    </div>
  );
}

type Props = {
  root: string | null;
  onSelect: (path: string) => void;
  onClose: () => void;
  /** Commands to search alongside files. Omit for a files-only finder. */
  commands?: CommandDef[];
};

export function AppleSpotlight({ root, onSelect, onClose, commands }: Props) {
  const [query, setQuery] = useState("");
  const recentFiles = useRecentFiles((s) => s.files);
  // The field updates on every keystroke; the list is allowed to lag behind
  // it. Without this, ranking several thousand paths runs synchronously
  // inside the keystroke and the caret visibly stutters on a large workspace.
  const deferredQuery = useDeferredValue(query);
  const { files: allFiles, loading } = useWorkspaceFiles(root);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useSpotlightResults(deferredQuery, allFiles, root, commands, recentFiles);

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
    const action = keyAction(e.key);
    if (!action) return;
    if (action === "close") return onClose();
    e.preventDefault();
    if (action === "commit") commit(activeIdx);
    else setActiveIdx((i) => (action === "down" ? Math.min(i + 1, results.length - 1) : Math.max(i - 1, 0)));
  };

  const expanded = query.trim().length > 0;
  const fileCount = results.filter((r) => r.kind === "file").length;
  const commandCount = results.length - fileCount;
  const spring: Spring = reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 34 };

  return (
    <div
      // Click-outside catcher. `presentation` (not aria-hidden — that would
      // hide the dialog it wraps) drops the element's own semantics without
      // touching its descendants; Escape is the keyboard equivalent.
      role="presentation"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh]"
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

      {/* The adaptive bar. At rest it is a compact pill with a short list of
          recent files; the moment there is a query it springs wide and
          squares off into the results-and-preview layout. Width and radius
          are animated values, not a layout animation: the app loads motion's
          `domAnimation` feature set, which has no layout support. */}
      <m.div
        role="dialog"
        aria-modal="true"
        aria-label="Spotlight"
        className="relative z-10 flex max-w-[94vw] flex-col overflow-hidden border border-border/60 bg-popover/95 shadow-2xl ring-1 ring-foreground/5 backdrop-blur-xl"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: -10, width: WIDTH_RESTING, borderRadius: 26 }}
        animate={{
          opacity: 1,
          scale: 1,
          y: 0,
          // A width animation on purpose: the rows must re-truncate at the new
          // width, which a transform cannot do, and `domAnimation` has no
          // layout animations. It runs once per expand or collapse, on one
          // element.
          // react-doctor-disable-next-line react-doctor/no-layout-property-animation
          width: expanded ? WIDTH_EXPANDED : WIDTH_RESTING,
          borderRadius: expanded ? 18 : 26,
        }}
        transition={spring}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <SearchGlyph loading={loading} expanded={expanded} spring={spring} />
          <span className="relative flex-1">
            {!query && root ? <RotatingHint reduceMotion={!!reduceMotion} /> : null}
            <input
              ref={inputRef}
              type="text"
              aria-label="Search files and commands"
              placeholder={root ? "" : "No workspace open"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKey}
              className="relative w-full bg-transparent text-[17px] text-foreground outline-none placeholder:text-muted-foreground/50"
            />
          </span>
          {expanded ? <CountBadge files={fileCount} commands={commandCount} spring={spring} /> : null}
        </div>

        <ResultsPane
          results={results}
          activeIdx={activeIdx}
          expanded={expanded}
          loading={loading}
          hasRoot={!!root}
          hasRecent={recentFiles.length > 0}
          listRef={listRef}
          onCommit={commit}
          onHover={setActiveIdx}
        />

        <KeyHints />
      </m.div>
    </div>
  );
}
