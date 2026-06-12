// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * MlStatusPill — status bar pill shown while a training run streams.
 * Click opens the ML sidebar panel.
 */
import { cn } from "@/lib/utils";
import { useMlStore } from "./store";
import { displayMetric, headlineMetric } from "./lib/friendly";

export function MlStatusPill() {
  const activeRun = useMlStore((s) => s.activeRun);
  const lastValues = useMlStore((s) => s.lastValues);

  if (
    !activeRun ||
    !["starting", "running", "cancelling"].includes(activeRun.status)
  ) {
    return null;
  }

  const hero = headlineMetric(Object.keys(lastValues));
  const heroText =
    hero && typeof lastValues[hero] === "number"
      ? ` · ${displayMetric(hero).format(lastValues[hero])}`
      : "";
  const pct = activeRun.totalEpochs
    ? Math.min(100, Math.round((activeRun.epoch / activeRun.totalEpochs) * 100))
    : null;
  const label =
    activeRun.status === "cancelling"
      ? "stopping…"
      : `training${pct !== null ? ` ${pct}%` : ""}${heroText}`;

  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent("nexis:open-sidebar-view", { detail: "ml" }),
        )
      }
      className={cn(
        "flex cursor-pointer items-center gap-1.5 rounded px-2 py-0.5 text-[10.5px] font-medium transition-colors",
        "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40",
      )}
      title="A model is training — open ML Lab"
    >
      <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500" />
      <span className="max-w-56 truncate">{label}</span>
    </button>
  );
}
