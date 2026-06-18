// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * MlStatusPill — status bar pill shown while a training run streams.
 * Click opens the ML sidebar panel.
 */
import { useEffect } from "react";
import { getCurrentWindow, ProgressBarStatus } from "@tauri-apps/api/window";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useMlStore } from "./store";
import { displayMetric, headlineMetric } from "./lib/friendly";

export function MlStatusPill() {
  const activeRun = useMlStore((s) => s.activeRun);
  const lastValues = useMlStore((s) => s.lastValues);

  // Auto-open the ML Lab when a run starts, if the user opted in. Lives
  // here (always mounted in the status bar) so it fires even when the
  // panel is closed. Keyed on runId so it triggers once per run.
  const autoOpen = usePreferencesStore((s) => s.mlAutoOpenOnTrain);
  const runId = activeRun?.runId ?? null;
  const isRunning = activeRun?.status === "running";
  useEffect(() => {
    if (autoOpen && isRunning && runId) {
      window.dispatchEvent(
        new CustomEvent("nexis:open-sidebar-view", { detail: "ml" }),
      );
    }
  }, [autoOpen, isRunning, runId]);

  // Mirror training progress onto the OS taskbar/dock icon — native polish
  // that's visible even when Nexis is in the background. Cleared as soon as
  // the run leaves a training state.
  const status = activeRun?.status;
  const epoch = activeRun?.epoch ?? 0;
  const totalEpochs = activeRun?.totalEpochs ?? 0;
  const paused = activeRun?.paused ?? false;
  useEffect(() => {
    const w = getCurrentWindow();
    const training =
      status === "running" || status === "starting" || status === "cancelling";
    if (!training) {
      void w.setProgressBar({ status: ProgressBarStatus.None });
      return;
    }
    if (totalEpochs > 0) {
      void w.setProgressBar({
        status: paused ? ProgressBarStatus.Paused : ProgressBarStatus.Normal,
        progress: Math.min(100, Math.round((epoch / totalEpochs) * 100)),
      });
    } else {
      void w.setProgressBar({ status: ProgressBarStatus.Indeterminate });
    }
  }, [status, epoch, totalEpochs, paused]);

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
