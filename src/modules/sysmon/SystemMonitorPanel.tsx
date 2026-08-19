// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Icon, type IconName } from "@/components/icon";
import { formatBytes, formatBytesPerSec, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SysmonSignal, SysmonSort, SysProcessRow } from "@/modules/ai/lib/native";
import { setSysmonIntervalMs } from "@/modules/settings/store";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useMemo, useState } from "react";
import { brailleChart } from "./braille";
import { SYSMON_INTERVALS, type SysmonIntervalMs } from "./interval";
import { HISTORY_LENGTH, useSystemMonitor } from "./useSystemMonitor";

/** Chart geometry. Width is in braille characters — each holds 2 samples. */
const CHART_COLS = 32;
const CHART_ROWS = 3;

/**
 * Rolling axis maximum for the unbounded series (network, disk I/O).
 *
 * Throughput has no natural ceiling, so the axis has to come from the data.
 * Scaling to the *visible window's* peak rather than an all-time peak keeps
 * the chart readable: one 900 MB/s spike an hour ago would otherwise flatten
 * every subsequent reading into the floor. The 1 KB/s minimum stops an idle
 * interface from amplifying noise into a full-height chart.
 */
const rollingMax = (series: readonly number[]): number =>
  Math.max(1024, ...series.slice(-CHART_COLS * 2));

export function SystemMonitorPanel() {
  const [sort, setSort] = useState<SysmonSort>("cpu");
  const [filter, setFilter] = useState("");
  const intervalMs = usePreferencesStore((s) => s.sysmonIntervalMs);
  const { sample, history, error, kill } = useSystemMonitor({ sort, intervalMs });

  const coreCount = sample?.cpu_per_core.length ?? 0;

  // Filtering is local to the render body — a Zustand-style derived value in
  // a memo is fine here, but see CLAUDE.md pitfall #14 before moving any of
  // this into a store selector.
  const rows = useMemo(() => {
    const list = sample?.processes ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) => p.name.toLowerCase().includes(q) || p.cmd.toLowerCase().includes(q),
    );
  }, [sample?.processes, filter]);

  if (!sample) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
        <Icon name="cpu" size="lg" className="text-muted-foreground/40" />
        <p className="text-[11px] text-muted-foreground">
          {error ? "Resource sampling unavailable" : "Sampling…"}
        </p>
        {error && (
          <p className="max-w-52 text-[10.5px] text-muted-foreground/60">{error}</p>
        )}
      </div>
    );
  }

  const memPct = sample.mem_total > 0 ? (sample.mem_used / sample.mem_total) * 100 : 0;
  const swapPct = sample.swap_total > 0 ? (sample.swap_used / sample.swap_total) * 100 : 0;
  const netRx = sample.networks.reduce((a, n) => a + n.rx_per_sec, 0);
  const netTx = sample.networks.reduce((a, n) => a + n.tx_per_sec, 0);
  const diskRead = sample.disks.reduce((a, d) => a + d.read_per_sec, 0);
  const diskWrite = sample.disks.reduce((a, d) => a + d.written_per_sec, 0);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          System
        </span>
        <div className="flex items-center gap-2">
          <span
            className="font-mono text-[10px] text-muted-foreground/70"
            title="Load average over 1, 5, and 15 minutes"
          >
            {sample.load_avg.map((n) => n.toFixed(2)).join("  ")}
          </span>
          <RateSwitcher active={intervalMs} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* CPU */}
        <Section
          icon={"cpu"}
          title="CPU"
          value={`${sample.cpu_total.toFixed(1)}%`}
          detail={`${coreCount} cores · up ${formatDuration(sample.uptime)}`}
        >
          <Chart series={history.cpu} max={100} tone="text-primary" />
          <CoreGrid values={sample.cpu_per_core} />
        </Section>

        {/* Memory */}
        <Section
          icon={"database"}
          title="Memory"
          value={`${memPct.toFixed(1)}%`}
          detail={`${formatBytes(sample.mem_used)} / ${formatBytes(sample.mem_total)}`}
        >
          <Chart series={history.mem} max={100} tone="text-primary/85" />
          {sample.swap_total > 0 && (
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-[10px] text-muted-foreground/70">Swap</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {formatBytes(sample.swap_used)} / {formatBytes(sample.swap_total)} (
                {swapPct.toFixed(0)}%)
              </span>
            </div>
          )}
        </Section>

        {/* Network */}
        <Section
          icon={"network-connected"}
          title="Network"
          value={`↓ ${formatBytesPerSec(netRx)}`}
          detail={`↑ ${formatBytesPerSec(netTx)}`}
        >
          <Chart
            series={history.netRx}
            max={rollingMax(history.netRx)}
            tone="text-primary/70"
          />
        </Section>

        {/* Disk */}
        <Section
          icon={"disk"}
          title="Disk"
          value={`R ${formatBytesPerSec(diskRead)}`}
          detail={`W ${formatBytesPerSec(diskWrite)}`}
        >
          <Chart
            series={history.diskWrite}
            max={rollingMax(history.diskWrite)}
            tone="text-primary/70"
          />
          <div className="mt-1 flex flex-col gap-0.5">
            {sample.disks.slice(0, 4).map((d) => {
              const used = d.total - d.available;
              const pct = d.total > 0 ? (used / d.total) * 100 : 0;
              return (
                <div
                  key={`${d.name}:${d.mount_point}`}
                  className="flex items-baseline justify-between gap-2"
                >
                  <span
                    className="truncate text-[10px] text-muted-foreground/70"
                    title={`${d.name} → ${d.mount_point}`}
                  >
                    {d.mount_point}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {formatBytes(used)} / {formatBytes(d.total)} ({pct.toFixed(0)}%)
                  </span>
                </div>
              );
            })}
          </div>
        </Section>

        {/* Processes */}
        <div className="border-b border-border/30 px-3 py-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Processes
            </span>
            <span className="font-mono text-[10px] text-muted-foreground/60">
              {rows.length === sample.process_count
                ? sample.process_count
                : `${rows.length} of ${sample.process_count}`}
            </span>
          </div>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter processes by name or command"
            placeholder="Filter by name or command…"
            className="mb-1.5 w-full rounded border border-border/50 bg-background px-1.5 py-1 text-[10.5px] outline-none placeholder:text-muted-foreground/50 focus:border-primary/50"
          />
          <div className="flex items-center gap-1 border-b border-border/30 pb-1">
            <SortHeader active={sort} value="name" onSort={setSort} className="flex-1 text-left">
              Name
            </SortHeader>
            <SortHeader active={sort} value="pid" onSort={setSort} className="w-12 text-right">
              PID
            </SortHeader>
            <SortHeader active={sort} value="cpu" onSort={setSort} className="w-12 text-right">
              CPU
            </SortHeader>
            <SortHeader active={sort} value="memory" onSort={setSort} className="w-14 text-right">
              MEM
            </SortHeader>
            <span className="w-4" />
          </div>
          <div className="flex flex-col">
            {rows.map((p) => (
              <ProcessRow key={p.pid} process={p} coreCount={coreCount} onKill={kill} />
            ))}
            {rows.length === 0 && (
              <p className="py-3 text-center text-[10.5px] text-muted-foreground/60">
                No matching processes
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Poll-rate switcher. Charts hold a fixed number of samples, so a faster
 * rate buys detail at the cost of window length: at 100 ms the 128-sample
 * history spans ~13 seconds, at 1 s it spans ~2 minutes. The fast steps also
 * cost real CPU — each sample re-walks the whole process table.
 */
function RateSwitcher({ active }: { active: number }) {
  return (
    <div
      role="group"
      aria-label="Sampling interval"
      className="flex items-center overflow-hidden rounded border border-border/50"
    >
      {SYSMON_INTERVALS.map((ms) => (
        <button
          key={ms}
          type="button"
          aria-pressed={ms === active}
          onClick={() => void setSysmonIntervalMs(ms)}
          title={`Sample every ${ms} ms — ${HISTORY_LENGTH} samples of history is ${formatSpan(ms)}`}
          className={cn(
            "px-1 py-px font-mono text-[9.5px] leading-tight transition-colors",
            ms === active
              ? "bg-primary/15 text-foreground"
              : "text-muted-foreground/60 hover:text-foreground",
          )}
        >
          {rateLabel(ms)}
        </button>
      ))}
    </div>
  );
}

/** "100" / "1s" — the trailing "ms" is dropped so four steps fit the rail. */
function rateLabel(ms: SysmonIntervalMs): string {
  return ms >= 1000 ? `${ms / 1000}s` : String(ms);
}

/** How much wall-clock the fixed-length history covers at this rate. */
function formatSpan(ms: number): string {
  const seconds = (HISTORY_LENGTH * ms) / 1000;
  return seconds >= 60
    ? `~${Math.round(seconds / 60)} min of history`
    : `~${Math.round(seconds)} s of history`;
}

function Section({
  icon,
  title,
  value,
  detail,
  children,
}: {
  icon: IconName;
  title: string;
  value: string;
  detail?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-border/30 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          <Icon name={icon} size="xs" />
          {title}
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="font-mono text-[11px] text-foreground">{value}</span>
          {detail && (
            <span className="font-mono text-[10px] text-muted-foreground/60">{detail}</span>
          )}
        </span>
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/**
 * The braille chart. Rendered as text in a `<pre>` so it inherits the
 * monospace metrics the dot grid assumes — in a proportional font the columns
 * would not line up.
 */
function Chart({
  series,
  max,
  tone,
}: {
  series: readonly number[];
  max: number;
  tone: string;
}) {
  const lines = brailleChart(series, { rows: CHART_ROWS, cols: CHART_COLS, max });
  return (
    <pre
      aria-hidden="true"
      className={cn(
        "overflow-hidden font-mono text-[10px] leading-[1.05] tracking-tighter",
        tone,
      )}
    >
      {lines.join("\n")}
    </pre>
  );
}

/** Per-core load as a compact grid of vertical bars — btop's core strip. */
function CoreGrid({ values }: { values: readonly number[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-[2px]">
      {values.map((v, i) => (
        <div
          key={i}
          title={`Core ${i}: ${v.toFixed(0)}%`}
          className="relative h-3 w-[6px] overflow-hidden rounded-[1px] bg-muted"
        >
          <div
            className={cn(
              "absolute bottom-0 w-full transition-[height] duration-300",
              // Only theme-driven tokens here. The `--chart-*` palette looks
              // tempting but is a fixed dark ramp that no theme overrides —
              // it would be near-invisible on the dark themes and would
              // ignore the user's theme entirely.
              v > 85 ? "bg-destructive/70" : v > 50 ? "bg-primary" : "bg-primary/50",
            )}
            style={{ height: `${Math.min(100, Math.max(0, v))}%` }}
          />
        </div>
      ))}
    </div>
  );
}

function SortHeader({
  active,
  value,
  onSort,
  className,
  children,
}: {
  active: SysmonSort;
  value: SysmonSort;
  onSort: (s: SysmonSort) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onSort(value)}
      className={cn(
        "text-[9.5px] font-semibold uppercase tracking-wider transition-colors",
        active === value
          ? "text-foreground"
          : "text-muted-foreground/50 hover:text-muted-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

function ProcessRow({
  process: p,
  coreCount,
  onKill,
}: {
  process: SysProcessRow;
  coreCount: number;
  onKill: (pid: number, signal?: SysmonSignal) => Promise<boolean>;
}) {
  // Rust reports `top`-style percent-of-one-core. Dividing by the core count
  // gives percent-of-machine, which is what the narrow column can show
  // without looking like it exceeds 100%.
  const machinePct = coreCount > 0 ? p.cpu / coreCount : p.cpu;
  return (
    <div className="group flex items-center gap-1 border-b border-border/20 py-[3px] hover:bg-muted/30">
      <span
        className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-foreground"
        title={p.cmd || p.name}
      >
        {p.name}
      </span>
      <span className="w-12 shrink-0 text-right font-mono text-[10px] text-muted-foreground/70">
        {p.pid}
      </span>
      <span
        className={cn(
          "w-12 shrink-0 text-right font-mono text-[10px]",
          machinePct > 20 ? "text-foreground" : "text-muted-foreground",
        )}
        title={`${p.cpu.toFixed(1)}% of one core`}
      >
        {machinePct.toFixed(1)}%
      </span>
      <span className="w-14 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
        {formatBytes(p.memory)}
      </span>
      <button
        type="button"
        // Shift-click escalates to SIGKILL. A plain click sends SIGTERM so
        // the process gets to clean up; escalation stays deliberate rather
        // than being the default.
        onClick={(e) => void onKill(p.pid, e.shiftKey ? "kill" : "term")}
        title={`Terminate ${p.name} (${p.pid}) — shift-click to force kill`}
        className="w-4 shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-[opacity,color,background-color] hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
      >
        <Icon name="close" size="xs" />
      </button>
    </div>
  );
}
