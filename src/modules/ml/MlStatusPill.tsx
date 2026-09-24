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
import { desktopProgress, desktopWindow } from "@/platform/desktop";
import { CallChip } from "@/components/ui/CallChip";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useMlStore } from "./store";
import { displayMetric, headlineMetric } from "./lib/friendly";

export function MlStatusPill() {
  const activeRun = useMlStore((s) => s.activeRun);
  const lastValues = useMlStore((s) => s.lastValues);
  const cancelActive = useMlStore((s) => s.cancelActive);

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
    const w = desktopWindow();
    const training =
      status === "running" || status === "starting" || status === "cancelling";
    if (!training) {
      void w.setProgressBar({ status: desktopProgress.None });
      return;
    }
    if (totalEpochs > 0) {
      void w.setProgressBar({
        status: paused ? desktopProgress.Paused : desktopProgress.Normal,
        progress: Math.min(100, Math.round((epoch / totalEpochs) * 100)),
      });
    } else {
      void w.setProgressBar({ status: desktopProgress.Indeterminate });
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

  // A CallChip rather than a bespoke pill: a training run is exactly what
  // that component is for — long-lived work the user started, which they
  // want to know the age of and be able to stop without first finding the
  // panel that owns it. It also brings the elapsed clock, which this pill
  // never had, sharing `lib/duration.ts` with ML Lab's own run header so the
  // two never disagree about how long the run has been going.
  return (
    <CallChip
      label={label}
      startedAtMs={activeRun.startedAtMs}
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent("nexis:open-sidebar-view", { detail: "ml" }),
        )
      }
      // Already stopping — offering "stop" again would do nothing.
      onEnd={
        activeRun.status === "cancelling"
          ? undefined
          : () => void cancelActive()
      }
      endLabel="Stop training"
      className="max-w-64"
    />
  );
}
