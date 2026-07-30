// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { native, type SysSample, type SysmonSort } from "@/modules/ai/lib/native";
import { useCallback, useEffect, useRef, useState } from "react";

/** Samples retained per series — the chart width the panel can actually draw
 *  (braille packs 2 points per character, so this is ~64 characters wide). */
export const HISTORY_LENGTH = 128;

export type SysHistory = {
  cpu: number[];
  mem: number[];
  swap: number[];
  netRx: number[];
  netTx: number[];
  diskRead: number[];
  diskWrite: number[];
  /** One series per logical core, index-aligned with `sample.cpu_per_core`. */
  perCore: number[][];
};

const emptyHistory = (): SysHistory => ({
  cpu: [],
  mem: [],
  swap: [],
  netRx: [],
  netTx: [],
  diskRead: [],
  diskWrite: [],
  perCore: [],
});

/** Append with a hard cap, returning a NEW array — history feeds React state,
 *  so mutating in place would skip re-renders. */
const push = (series: readonly number[], value: number): number[] => {
  const next = series.length >= HISTORY_LENGTH ? series.slice(1) : series.slice();
  next.push(value);
  return next;
};

/** Total a numeric field across per-disk / per-interface rows. */
const sum = <T,>(rows: readonly T[], pick: (row: T) => number): number =>
  rows.reduce((acc, row) => acc + pick(row), 0);

export type UseSystemMonitorOptions = {
  /** Poll period in ms. */
  intervalMs?: number;
  /** Skip the process table when the panel isn't showing it — a full process
   *  refresh is by far the most expensive part of a sample. */
  includeProcesses?: boolean;
  sort?: SysmonSort;
  /** Stop polling entirely (panel hidden, window blurred). */
  paused?: boolean;
};

/**
 * Polls the Rust sampler and maintains rolling history for the charts.
 *
 * Two behaviors worth knowing:
 *
 * 1. **The first sample is charted but its rates are not.** CPU percentages
 *    and I/O throughput are deltas between refreshes, so the first sample has
 *    nothing to diff against and Rust reports `elapsed_ms === 0`. Its
 *    absolute readings (memory, disk capacity) are valid and shown
 *    immediately; only the rate series wait for sample two, which is why the
 *    charts start one tick behind the numbers.
 *
 * 2. **Polling is self-scheduling, not `setInterval`.** Each tick schedules
 *    the next one only after the previous sample resolves. On a loaded
 *    machine a process refresh can outlast the interval, and `setInterval`
 *    would queue overlapping samples that pile onto the same Rust mutex —
 *    each one making the next slower.
 */
export function useSystemMonitor({
  intervalMs = 1000,
  includeProcesses = true,
  sort = "cpu",
  paused = false,
}: UseSystemMonitorOptions = {}) {
  const [sample, setSample] = useState<SysSample | null>(null);
  const [history, setHistory] = useState<SysHistory>(emptyHistory);
  const [error, setError] = useState<string | null>(null);

  // Read through refs inside the poll loop so changing sort/inclusion doesn't
  // tear down and restart the timer (which would drop history continuity).
  const optsRef = useRef({ includeProcesses, sort });
  optsRef.current = { includeProcesses, sort };

  const sampleOnce = useCallback(async () => {
    const { includeProcesses: withProcs, sort: sortKey } = optsRef.current;
    const next = await native.sysmonSample(sortKey, withProcs);
    setSample(next);
    setError(null);

    // Rates in the first sample are meaningless; chart absolutes only.
    const rated = next.elapsed_ms > 0;
    setHistory((prev) => {
      const memPct = next.mem_total > 0 ? (next.mem_used / next.mem_total) * 100 : 0;
      const swapPct = next.swap_total > 0 ? (next.swap_used / next.swap_total) * 100 : 0;
      const perCore = next.cpu_per_core.map((v, i) =>
        rated ? push(prev.perCore[i] ?? [], v) : (prev.perCore[i] ?? []),
      );
      return {
        cpu: rated ? push(prev.cpu, next.cpu_total) : prev.cpu,
        mem: push(prev.mem, memPct),
        swap: push(prev.swap, swapPct),
        netRx: rated ? push(prev.netRx, sum(next.networks, (n) => n.rx_per_sec)) : prev.netRx,
        netTx: rated ? push(prev.netTx, sum(next.networks, (n) => n.tx_per_sec)) : prev.netTx,
        diskRead: rated
          ? push(prev.diskRead, sum(next.disks, (d) => d.read_per_sec))
          : prev.diskRead,
        diskWrite: rated
          ? push(prev.diskWrite, sum(next.disks, (d) => d.written_per_sec))
          : prev.diskWrite,
        perCore,
      };
    });
  }, []);

  // The cleanup clears the pending timeout and sets `cancelled`, which also
  // stops the self-rescheduling `tick` from arming a new one after an in-flight
  // sample resolves. The rule only looks for a direct clearTimeout of a
  // top-level timer id, not one reassigned inside an async loop.
  // react-doctor-disable-next-line react-doctor/effect-needs-cleanup
  useEffect(() => {
    if (paused) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        await sampleOnce();
      } catch (e) {
        // A failed sample is not fatal — the backend may still be starting, or
        // a single refresh may have raced a process exiting. Surface it and
        // keep polling; the next tick usually recovers on its own.
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
      if (!cancelled) timer = setTimeout(() => void tick(), intervalMs);
    };
    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [intervalMs, paused, sampleOnce]);

  const kill = useCallback(
    async (pid: number, signal?: Parameters<typeof native.sysmonKill>[1]) => {
      const killed = await native.sysmonKill(pid, signal);
      // Re-sample straight away so the row disappears on the click rather
      // than lingering until the next tick.
      await sampleOnce().catch(() => {});
      return killed;
    },
    [sampleOnce],
  );

  return { sample, history, error, kill, refresh: sampleOnce };
}
