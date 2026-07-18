// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { useEffect, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatBytes } from "@/lib/format";
import { approxHistoryBytes } from "@/modules/ai/store/chatStore";
import { poolMemoryStats } from "@/modules/terminal/lib/rendererPool";
import { totalRecordingBytes } from "@/modules/terminal/lib/useRecording";
import { sessionMemoryStats } from "@/modules/terminal/lib/useTerminalSession";

type Stats = {
  slots: number;
  adopted: number;
  glContexts: number;
  bufferedLines: number;
  sessions: number;
  dormantBytes: number;
  snapshotBytes: number;
  recordingBytes: number;
  historyBytes: number;
};

function collect(): Stats {
  const pool = poolMemoryStats();
  const sess = sessionMemoryStats();
  return {
    ...pool,
    ...sess,
    recordingBytes: totalRecordingBytes(),
    historyBytes: approxHistoryBytes(),
  };
}

const POLL_MS = 2000;

/**
 * Opt-in debug readout (Settings → General → "Memory self-report") so
 * resource creep is visible during development: renderer-pool slot / live
 * WebGL-context counts (keeps the slot-reaping win proven), buffered
 * scrollback, dormant-tab output, in-flight recording size, and the
 * serialized size of AI chat histories (~4 bytes/token). Costs nothing
 * while disabled — the component isn't mounted and no polling runs.
 */
export function MemoryReportPill() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    setStats(collect());
    const t = setInterval(() => setStats(collect()), POLL_MS);
    return () => clearInterval(t);
  }, []);

  if (!stats) return null;
  const approxTokens = Math.round(stats.historyBytes / 4);
  const summary = [
    `${stats.slots}s/${stats.glContexts}gl`,
    `${(stats.bufferedLines / 1000).toFixed(1)}k ln`,
    `${formatBytes(stats.historyBytes)} ai`,
  ].join(" · ");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="shrink-0 cursor-default rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
          {summary}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="font-mono text-[11px] leading-relaxed">
        <div>renderer slots: {stats.slots} ({stats.adopted} adopted, {stats.glContexts} WebGL contexts)</div>
        <div>scrollback: {stats.bufferedLines.toLocaleString()} lines buffered</div>
        <div>dormant output: {formatBytes(stats.dormantBytes)} · snapshots: {formatBytes(stats.snapshotBytes)} ({stats.sessions} sessions)</div>
        <div>recording: {formatBytes(stats.recordingBytes)}</div>
        <div>AI history: {formatBytes(stats.historyBytes)} (~{approxTokens.toLocaleString()} tokens)</div>
      </TooltipContent>
    </Tooltip>
  );
}
