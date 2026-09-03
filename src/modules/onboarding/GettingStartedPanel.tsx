// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The persistent half of onboarding.
 *
 * A tour is gone the moment it is dismissed; this is not. It is a real sidebar
 * panel, reachable from the command palette forever, and it is what still
 * works for someone who skipped everything on day one — which is most people.
 *
 * Its contents are derived from `enabledPacks` on every render rather than
 * stored, so changing the preset in Settings → Features re-derives the list
 * instead of orphaning it. Progress is the only thing persisted.
 */

import { Icon } from "@/components/icon";
import { MOD_KEY } from "@/lib/platform";
import {
  checklistFor,
  onboardingProgress,
  stepKeys,
  type OnboardingAction,
  type OnboardingStep,
} from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setOnboardingCompleted } from "@/modules/settings/store";

type Props = {
  /** Performs a step's action. Owned by App, which holds the handlers. */
  onRunAction: (action: OnboardingAction) => void;
  /** Re-run the guided tour. */
  onStartTour: () => void;
};

export function GettingStartedPanel({ onRunAction, onStartTour }: Props) {
  // Selectors return the store's own array; filtering happens locally so the
  // snapshot reference stays stable (pitfall #14).
  const enabledPacks = usePreferencesStore((s) => s.enabledPacks);
  const completed = usePreferencesStore((s) => s.onboardingCompleted);

  const steps = checklistFor(enabledPacks);
  const doneSet = new Set(completed);
  const { done, total } = onboardingProgress(enabledPacks, completed);

  const toggle = (step: OnboardingStep) => {
    const next = doneSet.has(step.id)
      ? completed.filter((id) => id !== step.id)
      : [...completed, step.id];
    void setOnboardingCompleted(next);
  };

  const run = (step: OnboardingStep) => {
    onRunAction(step.action);
    // Doing the thing is what completes it; the checkbox is the manual
    // fallback for steps the app cannot observe from here.
    if (!doneSet.has(step.id)) {
      void setOnboardingCompleted([...completed, step.id]);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <Icon name="checklist" className="text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Getting Started
        </span>
        <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold text-primary">
          {done} / {total}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {done === total && total > 0 && (
          <div className="flex items-center gap-2 border-b border-border/50 bg-primary/[0.06] px-3 py-2">
            <Icon name="success" size="sm" className="text-primary" />
            <span className="text-[11px] text-muted-foreground">
              That is the tour of the place. This panel stays in the command
              palette if you want it again.
            </span>
          </div>
        )}

        <ul className="flex flex-col p-1.5">
          {steps.map((step) => {
            const isDone = doneSet.has(step.id);
            const keys = stepKeys(step, MOD_KEY);
            return (
              <li key={step.id}>
                <div
                  className={cn(
                    "group flex items-start gap-2 rounded-lg px-2 py-2 transition-colors",
                    "hover:bg-primary/[0.05]",
                  )}
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isDone}
                    aria-label={`Mark "${step.label}" as ${isDone ? "not done" : "done"}`}
                    onClick={() => toggle(step)}
                    className={cn(
                      "mt-px flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                      isDone
                        ? "border-primary/60 bg-primary/20 text-primary"
                        : "border-border/70 text-transparent hover:border-primary/40",
                    )}
                  >
                    <Icon name="check" size="xs" />
                  </button>

                  <button
                    type="button"
                    onClick={() => run(step)}
                    className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
                  >
                    <span className="flex w-full items-center gap-1.5">
                      <Icon
                        name={step.icon}
                        size="sm"
                        className={
                          isDone ? "text-muted-foreground/50" : "text-primary/80"
                        }
                      />
                      <span
                        className={cn(
                          "text-[12px] font-medium",
                          isDone && "text-muted-foreground/60 line-through",
                        )}
                      >
                        {step.label}
                      </span>
                      {keys && (
                        <span className="ml-auto flex shrink-0 items-center gap-0.5">
                          {keys.map((k, i) => (
                            <kbd
                              key={i}
                              className="rounded border border-border/60 bg-muted/60 px-1 py-px text-[9.5px] leading-none text-muted-foreground"
                            >
                              {k}
                            </kbd>
                          ))}
                        </span>
                      )}
                    </span>
                    <span className="text-[10.5px] leading-relaxed text-muted-foreground/80">
                      {step.why}
                    </span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="shrink-0 border-t border-border/50 px-3 py-2">
        <button
          type="button"
          onClick={onStartTour}
          className="flex items-center gap-1.5 rounded text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <Icon name="play" size="xs" />
          Replay the guided tour
        </button>
      </div>
    </div>
  );
}
