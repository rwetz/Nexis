import { BACKEND_COLOR, BACKEND_SHORT } from "@/lib/backendMeta";
import { formatBytes, formatCompact, formatMs } from "@/lib/utils";
import { type BenchResult, type ModelInfo } from "@/lib/types";

interface Winner {
  label: string;
  value: string;
  modelName: string;
  backendId: BenchResult["backendId"];
}

/** Scannable "leaders" across the run — one tile per headline metric. */
export function SummaryStrip({
  results,
  models,
}: {
  results: BenchResult[];
  models: ModelInfo[];
}) {
  const done = results.filter((r) => r.status === "done" && r.metrics);
  if (done.length === 0) return null;
  const nameOf = (id: string) => models.find((m) => m.id === id)?.name ?? id;

  const best = (
    label: string,
    pick: (r: BenchResult) => number | null | undefined,
    dir: "max" | "min",
    fmt: (v: number) => string,
  ): Winner | null => {
    let win: BenchResult | null = null;
    let winV = dir === "max" ? -Infinity : Infinity;
    for (const r of done) {
      const v = pick(r);
      if (v == null || !Number.isFinite(v)) continue;
      if ((dir === "max" && v > winV) || (dir === "min" && v < winV)) {
        winV = v;
        win = r;
      }
    }
    if (!win) return null;
    return { label, value: fmt(winV), modelName: nameOf(win.modelId), backendId: win.backendId };
  };

  const tiles = [
    best("Fastest", (r) => r.metrics?.tokensPerSec, "max", (v) => `${formatCompact(v)} tok/s`),
    best("Snappiest", (r) => r.metrics?.firstTokenMs, "min", formatMs),
    best("Leanest", (r) => (r.metrics?.peakMemBytes || 0) > 0 ? r.metrics?.peakMemBytes : null, "min", (v) => formatBytes(v, 0)),
    best("Most accurate", (r) => r.metrics?.accuracy ?? null, "max", (v) => `${(v * 100).toFixed(1)}%`),
  ].filter((t): t is Winner => t !== null);

  return (
    <div className="grid grid-cols-2 gap-2.5 @2xl:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="flex flex-col gap-1 rounded-xl border border-border bg-card px-3.5 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {t.label}
          </span>
          <span className="font-mono text-xl font-semibold tabular-nums leading-none">{t.value}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
            <span className="size-2 shrink-0 rounded-full" style={{ background: BACKEND_COLOR[t.backendId] }} />
            <span className="truncate">{t.modelName}</span>
            <span className="shrink-0 text-muted-foreground/50">· {BACKEND_SHORT[t.backendId]}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
