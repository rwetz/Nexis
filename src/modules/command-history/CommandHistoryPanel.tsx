// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The command ledger, made visible.
 *
 * Four of ROADMAP's *"terminal-native features an IDE can't have"* land here,
 * because they are four views of one store rather than four features:
 *
 * - **Recent** — every command this workspace has run, filterable by outcome.
 *   Also the home of §5's per-entry forget, which belongs with the list that
 *   shows entries rather than in Settings.
 * - **Output archive** — a content search across captured output. The live
 *   buffer answers "where did I see that error string?" only until scrollback
 *   rolls past its cap (pitfall #7); this answers it for as long as retention
 *   keeps the blob.
 * - **Trends** — the median duration of each command over time, and the drift
 *   between its recent and older runs. Nothing else times the commands you
 *   actually run, so a build that doubled is normally invisible until it is
 *   unbearable.
 * - **Journal** — what the day held. Developer tools are built for teams, and
 *   a team gets this from the tracker; a solo developer has no tracker, and
 *   nothing else reconstructs the day.
 *
 * The panel reads. It never records — that is the OSC 133 handler's job — and
 * the only thing it writes is a deletion.
 */

import { Icon } from "@/components/icon";
import { formatDuration, relativeTime } from "@/lib/format";
import { basename } from "@/lib/path";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { openSettingsWindow } from "@/modules/settings/openSettingsWindow";
import {
  forgetLedgerEntry,
  queryLedger,
  readLedgerOutput,
  searchLedgerOutput,
  type CommandRecord,
  type OutputHit,
} from "@/modules/terminal/lib/ledger";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  buildJournal,
  buildTrends,
  startOfDay,
  type Trend,
} from "./lib/analysis";

type Props = { workspaceRoot: string | null };

type Tab = "recent" | "trends" | "journal";
type ExitFilter = "all" | "success" | "failure";

/**
 * How many records the analytical tabs read.
 *
 * A record is ~200 bytes, so this is a few hundred KB across IPC — paid once
 * when the panel is opened, not per keystroke. Trends and the journal need a
 * span rather than a page, and a median over the last fifty commands would
 * not be a trend.
 */
const ANALYSIS_LIMIT = 4_000;

/** The list is paged by intent: a scrollable wall of 4,000 rows is not a list. */
const LIST_LIMIT = 300;

/** Output search is a scan over files, so it stops early and says so. */
const OUTPUT_HIT_LIMIT = 60;

const DEBOUNCE_MS = 140;

const JOURNAL_WINDOWS = [
  { id: "today", label: "Today" },
  { id: "week", label: "7 days" },
  { id: "month", label: "30 days" },
] as const;

type JournalWindowId = (typeof JOURNAL_WINDOWS)[number]["id"];

function journalFrom(id: JournalWindowId, now: number): number {
  if (id === "today") return startOfDay(now);
  return now - (id === "week" ? 7 : 30) * 24 * 60 * 60 * 1000;
}

/** "4.2s" for a command duration — sub-second commands read as "<1s". */
function shortDuration(ms: number): string {
  if (ms < 1000) return "<1s";
  return formatDuration(Math.round(ms / 1000));
}

export function CommandHistoryPanel({ workspaceRoot }: Props) {
  const enabled = usePreferencesStore((s) => s.commandLedgerEnabled);
  const [tab, setTab] = useState<Tab>("recent");

  if (!enabled || workspaceRoot === null) {
    return <NotRecording hasWorkspace={workspaceRoot !== null} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <Icon name="clock" className="text-muted-foreground" />
        <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          Command History
        </span>
        <span className="ml-auto truncate text-[10px] text-muted-foreground/60">
          {basename(workspaceRoot) || workspaceRoot}
        </span>
      </div>

      <div
        role="tablist"
        aria-label="Command history views"
        className="flex shrink-0 items-center gap-1 border-b border-border/50 px-2 py-1.5"
      >
        {(
          [
            ["recent", "Recent"],
            ["trends", "Trends"],
            ["journal", "Journal"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "rounded-md px-2 py-0.5 text-[11px] transition-colors",
              tab === id
                ? "bg-accent/70 text-foreground"
                : "text-muted-foreground hover:bg-muted/40",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "recent" ? (
        <RecentTab root={workspaceRoot} />
      ) : tab === "trends" ? (
        <TrendsTab root={workspaceRoot} />
      ) : (
        <JournalTab root={workspaceRoot} />
      )}
    </div>
  );
}

/**
 * The state before there is anything to show.
 *
 * Two different reasons, said separately, each with the one action that fixes
 * it — an empty panel that does not say why it is empty is the most common way
 * a feature gets written off as broken.
 */
function NotRecording({ hasWorkspace }: { hasWorkspace: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <Icon name="clock" size="lg" className="text-muted-foreground/40" />
      <p className="text-[12px] font-medium">
        {hasWorkspace ? "Command recording is off" : "No workspace open"}
      </p>
      <p className="text-[10.5px] leading-relaxed text-muted-foreground">
        {hasWorkspace
          ? "Nexis can keep a local record of the commands you run here — what worked, how long it took, and what it printed. Nothing leaves your machine, and private terminals are never recorded."
          : "Open a folder to see the commands recorded in it. Each workspace keeps its own history."}
      </p>
      {hasWorkspace ? (
        <button
          type="button"
          onClick={() => void openSettingsWindow("privacy")}
          className="mt-1 rounded-md border border-border/60 px-2.5 py-1 text-[11px] hover:bg-muted/50"
        >
          Open privacy settings
        </button>
      ) : null}
    </div>
  );
}

// ── Recent ──────────────────────────────────────────────────────────────────

function RecentTab({ root }: { root: string }) {
  const [query, setQuery] = useState("");
  const [exit, setExit] = useState<ExitFilter>("all");
  /** Searching output is a different question, so it is a mode, not a filter. */
  const [inOutput, setInOutput] = useState(false);
  const [records, setRecords] = useState<CommandRecord[]>([]);
  const [hits, setHits] = useState<OutputHit[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  const load = useCallback(
    (q: string, filter: ExitFilter, output: boolean) => {
      const seq = ++seqRef.current;
      setLoading(true);
      const done = () => seq === seqRef.current;

      if (output) {
        void searchLedgerOutput(root, q, OUTPUT_HIT_LIMIT)
          .then((h) => {
            if (!done()) return;
            setHits(h);
            setLoading(false);
          })
          .catch(() => done() && setLoading(false));
        return;
      }
      void queryLedger(root, {
        query: q,
        exit: filter === "all" ? null : filter,
        dedupe: false,
        limit: LIST_LIMIT,
      })
        .then((r) => {
          if (!done()) return;
          setRecords(r);
          setLoading(false);
        })
        .catch(() => done() && setLoading(false));
    },
    [root],
  );

  useEffect(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(
      () => load(query.trim(), exit, inOutput),
      DEBOUNCE_MS,
    );
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [query, exit, inOutput, load]);

  const refresh = () => load(query.trim(), exit, inOutput);

  const forget = async (record: CommandRecord) => {
    try {
      await forgetLedgerEntry(root, record.id);
      // Drop it locally too rather than waiting for the reload: the gesture
      // has to look as final as it is.
      setRecords((rs) => rs.filter((r) => r.id !== record.id));
      setHits((hs) => hs.filter((h) => h.record.id !== record.id));
      toast.success("Forgot that command");
    } catch (e) {
      toast.error("Could not forget that command", { description: String(e) });
    }
  };

  const rows: { record: CommandRecord; snippet?: string; matches?: number }[] =
    inOutput
      ? hits.map((h) => ({
          record: h.record,
          snippet: h.snippet,
          matches: h.matches,
        }))
      : records.map((record) => ({ record }));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border/50 px-2 py-1.5">
        <Icon name="search" size="xs" className="shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
          aria-label={
            inOutput ? "Search captured output" : "Search recorded commands"
          }
          placeholder={inOutput ? "Search output…" : "Search commands…"}
          className="min-w-0 flex-1 bg-transparent font-mono text-[11px] outline-none placeholder:text-muted-foreground/50"
        />
        <button
          type="button"
          onClick={refresh}
          title="Refresh"
          className="rounded p-0.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        >
          <Icon name="refresh" size="xs" />
        </button>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border/40 px-2 py-1.5">
        {(
          [
            ["all", "All"],
            ["success", "Succeeded"],
            ["failure", "Failed"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={exit === id}
            disabled={inOutput}
            onClick={() => setExit(id)}
            className={cn(
              "rounded px-1.5 py-0.5 text-[10.5px] transition-colors",
              exit === id && !inOutput
                ? "bg-accent/70 text-foreground"
                : "text-muted-foreground hover:bg-muted/40",
              inOutput && "opacity-40",
            )}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={inOutput}
          onClick={() => setInOutput((v) => !v)}
          title="Search the text commands printed, not the commands themselves"
          className={cn(
            "ml-auto rounded px-1.5 py-0.5 text-[10.5px] transition-colors",
            inOutput
              ? "bg-accent/70 text-foreground"
              : "text-muted-foreground hover:bg-muted/40",
          )}
        >
          In output
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && rows.length === 0 ? (
          <p className="px-3 py-4 text-center text-[11px] text-muted-foreground">
            Reading…
          </p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-[11px] leading-relaxed text-muted-foreground">
            {inOutput
              ? query.trim() === ""
                ? "Type to search everything your commands have printed here."
                : "No output matches. Only commands that printed something are searchable, and retention may have evicted older output."
              : query.trim() === ""
                ? "Nothing recorded yet. Commands appear here once they finish."
                : "No commands match."}
          </p>
        ) : (
          rows.map(({ record, snippet, matches }) => (
            <RecentRow
              key={record.id}
              root={root}
              record={record}
              snippet={snippet}
              matches={matches}
              expanded={expanded === record.id}
              onToggle={() =>
                setExpanded((id) => (id === record.id ? null : record.id))
              }
              onForget={() => void forget(record)}
            />
          ))
        )}
        {rows.length >= (inOutput ? OUTPUT_HIT_LIMIT : LIST_LIMIT) ? (
          <p className="px-3 py-2 text-center text-[10px] text-muted-foreground/60">
            Showing the newest {rows.length}. Narrow the search to see further
            back.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function RecentRow({
  root,
  record,
  snippet,
  matches,
  expanded,
  onToggle,
  onForget,
}: {
  root: string;
  record: CommandRecord;
  snippet?: string;
  matches?: number;
  expanded: boolean;
  onToggle: () => void;
  onForget: () => void;
}) {
  const [output, setOutput] = useState<string | null>(null);
  const [loadingOutput, setLoadingOutput] = useState(false);

  // Output is fetched only when a row is opened. A list that eagerly loaded
  // every blob would pull megabytes across IPC to render forty command lines.
  useEffect(() => {
    if (!expanded || !record.outputId || output !== null) return;
    setLoadingOutput(true);
    void readLedgerOutput(root, record.outputId)
      .then(setOutput)
      .finally(() => setLoadingOutput(false));
  }, [expanded, record.outputId, root, output]);

  const failed = record.exitCode !== 0;

  return (
    <div className="border-b border-border/30 last:border-b-0">
      <div
        className={cn(
          "group flex w-full items-center gap-2 px-2 py-1.5",
          expanded ? "bg-muted/30" : "hover:bg-muted/20",
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {/* Exit status as a dot: the gutter in the terminal uses the same
              green/red, so the two surfaces read as one idea. */}
          <span
            aria-hidden="true"
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              failed ? "bg-destructive" : "bg-emerald-500/80",
            )}
          />
          <span className="min-w-0 flex-1 truncate font-mono text-[11.5px]">
            {record.argv}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">
            {failed ? `exit ${record.exitCode} · ` : ""}
            {shortDuration(record.durationMs)} · {relativeTime(record.startedAt)}
          </span>
        </button>
        <button
          type="button"
          onClick={onForget}
          title="Forget this command"
          aria-label={`Forget: ${record.argv}`}
          className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100"
        >
          <Icon name="delete" size="xs" />
        </button>
      </div>

      {snippet ? (
        <p className="truncate px-2 pb-1.5 pl-[22px] font-mono text-[10px] text-muted-foreground">
          {snippet}
          {matches && matches > 1 ? (
            <span className="ml-1 text-muted-foreground/60">
              (+{matches - 1} more)
            </span>
          ) : null}
        </p>
      ) : null}

      {expanded ? (
        <div className="space-y-1.5 border-t border-border/30 bg-background/40 px-2 py-2 pl-[22px]">
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            {record.cwd || "(no directory recorded)"}
          </p>
          {record.outputId ? (
            loadingOutput ? (
              <p className="text-[10px] text-muted-foreground">Reading output…</p>
            ) : output === null ? (
              <p className="text-[10px] text-muted-foreground">
                The captured output has been evicted by retention.
              </p>
            ) : (
              <pre className="max-h-56 overflow-auto rounded border border-border/40 bg-background/60 p-1.5 font-mono text-[10px] leading-relaxed whitespace-pre-wrap">
                {output}
              </pre>
            )
          ) : (
            <p className="text-[10px] text-muted-foreground">
              No output was captured for this command.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ── Trends ──────────────────────────────────────────────────────────────────

function TrendsTab({ root }: { root: string }) {
  const [records, setRecords] = useState<CommandRecord[] | null>(null);

  useEffect(() => {
    let alive = true;
    void queryLedger(root, { limit: ANALYSIS_LIMIT })
      .then((r) => alive && setRecords(r))
      .catch(() => alive && setRecords([]));
    return () => {
      alive = false;
    };
  }, [root]);

  const trends = useMemo(
    () => (records ? buildTrends(records) : []),
    [records],
  );

  if (records === null) {
    return (
      <p className="px-3 py-4 text-center text-[11px] text-muted-foreground">
        Reading…
      </p>
    );
  }

  if (trends.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-[11px] leading-relaxed text-muted-foreground">
        Nothing to chart yet. A command needs to have run more than once, and to
        take longer than about a second, before its timings say anything.
      </p>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <p className="px-2.5 py-1.5 text-[10px] leading-relaxed text-muted-foreground/70">
        Ordered by total time spent, which is where the wall-clock actually
        goes. Drift compares each command's recent runs against its older ones.
      </p>
      {trends.map((t) => (
        <TrendRow key={t.argv} trend={t} />
      ))}
    </div>
  );
}

function TrendRow({ trend }: { trend: Trend }) {
  // A regression worth naming. Below this, run-to-run variance on a shared
  // machine explains it, and a badge on every row means nothing.
  const notable = trend.driftPct !== null && Math.abs(trend.driftPct) >= 25;
  const worse = (trend.driftPct ?? 0) > 0;

  return (
    <div className="border-b border-border/30 px-2 py-1.5 last:border-b-0">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px]">
          {trend.argv}
        </span>
        {notable ? (
          <span
            className={cn(
              "shrink-0 rounded px-1 py-px font-mono text-[9.5px]",
              worse
                ? "bg-destructive/15 text-destructive"
                : "bg-emerald-500/15 text-emerald-500",
            )}
          >
            {worse ? "+" : ""}
            {trend.driftPct}%
          </span>
        ) : null}
        <Sparkline values={trend.series} />
      </div>
      <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-muted-foreground/70">
        <span>median {shortDuration(trend.medianMs)}</span>
        <span>·</span>
        <span>last {shortDuration(trend.lastMs)}</span>
        <span>·</span>
        <span>
          {trend.runs} run{trend.runs === 1 ? "" : "s"}
        </span>
        {trend.failures > 0 ? (
          <>
            <span>·</span>
            <span className="text-destructive/80">
              {trend.failures} failed
            </span>
          </>
        ) : null}
        <span className="ml-auto">{relativeTime(trend.lastAt)}</span>
      </div>
    </div>
  );
}

/**
 * A duration series at row height.
 *
 * Deliberately unlabelled and unscaled against anything but itself — the
 * numbers beside it are the precise reading, and this is the shape. Drawn
 * rather than pulled from a chart library: one polyline is not worth a
 * dependency, and the row has no room for axes anyway.
 */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const width = 56;
  const height = 14;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / span) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
      className="shrink-0 overflow-visible text-muted-foreground/60"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Journal ─────────────────────────────────────────────────────────────────

function JournalTab({ root }: { root: string }) {
  const [records, setRecords] = useState<CommandRecord[] | null>(null);
  const [windowId, setWindowId] = useState<JournalWindowId>("today");

  useEffect(() => {
    let alive = true;
    void queryLedger(root, { limit: ANALYSIS_LIMIT })
      .then((r) => alive && setRecords(r))
      .catch(() => alive && setRecords([]));
    return () => {
      alive = false;
    };
  }, [root]);

  const journal = useMemo(() => {
    if (!records) return null;
    const now = Date.now();
    return buildJournal(records, journalFrom(windowId, now), now);
  }, [records, windowId]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex items-center gap-1 border-b border-border/40 px-2 py-1.5">
        {JOURNAL_WINDOWS.map((w) => (
          <button
            key={w.id}
            type="button"
            aria-pressed={windowId === w.id}
            onClick={() => setWindowId(w.id)}
            className={cn(
              "rounded px-1.5 py-0.5 text-[10.5px] transition-colors",
              windowId === w.id
                ? "bg-accent/70 text-foreground"
                : "text-muted-foreground hover:bg-muted/40",
            )}
          >
            {w.label}
          </button>
        ))}
      </div>

      {journal === null ? (
        <p className="px-3 py-4 text-center text-[11px] text-muted-foreground">
          Reading…
        </p>
      ) : journal.commands === 0 ? (
        <p className="px-4 py-6 text-center text-[11px] leading-relaxed text-muted-foreground">
          Nothing recorded in this window.
        </p>
      ) : (
        <div className="space-y-3 px-2.5 py-2.5">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="commands" value={journal.commands.toLocaleString()} />
            <Stat
              label="failed"
              value={journal.failures.toLocaleString()}
              tone={journal.failures > 0 ? "bad" : undefined}
            />
            <Stat label="running" value={shortDuration(journal.activeMs)} />
          </div>

          <p className="text-[10px] leading-relaxed text-muted-foreground/70">
            {journal.firstAt !== null && journal.lastAt !== null
              ? `First command ${relativeTime(journal.firstAt)}, last ${relativeTime(journal.lastAt)}.`
              : null}{" "}
            "Running" is wall-clock spent inside commands, not time worked — a
            dev server left running inflates it.
          </p>

          <JournalList title="What ran" entries={journal.families} />
          <JournalList
            title="Where"
            entries={journal.directories.slice(0, 8)}
            mono
          />
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "bad";
}) {
  return (
    <div className="rounded-md border border-border/50 bg-card/50 px-2 py-1.5">
      <div
        className={cn(
          "font-mono text-[15px] leading-none",
          tone === "bad" && "text-destructive",
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-[9.5px] tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
    </div>
  );
}

function JournalList({
  title,
  entries,
  mono,
}: {
  title: string;
  entries: { label: string; runs: number; totalMs: number }[];
  mono?: boolean;
}) {
  if (entries.length === 0) return null;
  const busiest = entries[0].runs;
  return (
    <div className="space-y-1">
      <div className="text-[9.5px] tracking-wide text-muted-foreground uppercase">
        {title}
      </div>
      {entries.slice(0, 10).map((e) => (
        <div key={e.label} className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            {/* The bar sits behind the label rather than beside it: at panel
                width, a separate bar column would leave no room for names. */}
            <div
              aria-hidden="true"
              className="absolute inset-y-0 left-0 rounded-sm bg-primary/10"
              style={{ width: `${Math.max(4, (e.runs / busiest) * 100)}%` }}
            />
            <span
              className={cn(
                "relative block truncate px-1 py-0.5 text-[10.5px]",
                mono && "font-mono",
              )}
              title={e.label}
            >
              {mono ? basename(e.label) || e.label : e.label}
            </span>
          </div>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">
            {e.runs} · {shortDuration(e.totalMs)}
          </span>
        </div>
      ))}
    </div>
  );
}
