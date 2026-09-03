// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The persistent half of onboarding, as a full-window takeover.
 *
 * A tour is gone the moment it is dismissed; this is not. It is reachable
 * forever from the welcome screen, the command palette, and the tour's own
 * footer, and it is what still works for someone who skipped everything on day
 * one — which is most people.
 *
 * It takes the window rather than a sidebar column, matching Settings and the
 * shortcut reference. That is not only cosmetic: the checklist describes the
 * chrome, and describing the chrome from inside a 300px slice of it left no
 * room for the *why* line that is the whole point of each row.
 *
 * Its contents are derived from `enabledPacks` on every render rather than
 * stored, so changing the preset in Settings → Features re-derives the list
 * instead of orphaning it. Progress is the only thing persisted.
 */

import { Icon } from "@/components/icon";
import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  setOnboardingCompleted,
  setOnboardingTourDone,
} from "@/modules/settings/store";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useCallback } from "react";
import { useOnboardingDialogStore } from "./onboardingDialogStore";

type Props = {
  /** Performs a step's action. Owned by App, which holds the handlers. */
  onRunAction: (action: OnboardingAction) => void;
  /** Re-run the guided tour. */
  onStartTour: () => void;
};

export function OnboardingDialog({ onRunAction, onStartTour }: Props) {
  const isOpen = useOnboardingDialogStore((s) => s.isOpen);

  // Selectors return the store's own array; filtering happens locally so the
  // snapshot reference stays stable (pitfall #14).
  const enabledPacks = usePreferencesStore((s) => s.enabledPacks);
  const completed = usePreferencesStore((s) => s.onboardingCompleted);
  const tourDone = usePreferencesStore((s) => s.onboardingTourDone);

  /**
   * Closing is what retires the first-run screen. The flag is written here
   * rather than when it opens so a crash mid-first-run does not silently cost
   * someone their one automatic showing, and it covers every exit — Escape,
   * the overlay, the close button, and running a step.
   */
  const close = useCallback(() => {
    useOnboardingDialogStore.getState().hide();
    if (!tourDone) void setOnboardingTourDone(true);
  }, [tourDone]);

  const steps = checklistFor(enabledPacks);
  const doneSet = new Set(completed);
  const { done, total } = onboardingProgress(enabledPacks, completed);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const toggle = (step: OnboardingStep) => {
    const next = doneSet.has(step.id)
      ? completed.filter((id) => id !== step.id)
      : [...completed, step.id];
    void setOnboardingCompleted(next);
  };

  const run = (step: OnboardingStep) => {
    // The takeover covers the thing the step is about, so get out of the way
    // before performing it — otherwise "Open the AI agent" opens a panel
    // nobody can see.
    close();
    onRunAction(step.action);
    // Doing the thing is what completes it; the checkbox is the manual
    // fallback for steps the app cannot observe from here.
    if (!doneSet.has(step.id)) {
      void setOnboardingCompleted([...completed, step.id]);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className={[
            "fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "flex flex-col overflow-hidden",
            "w-[min(920px,calc(100vw-2rem))] h-[min(700px,calc(100vh-4rem))]",
            "rounded-2xl bg-popover text-popover-foreground",
            "shadow-xl ring-1 ring-foreground/8",
            "duration-100 outline-none",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
            "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          ].join(" ")}
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">Getting started with Nexis</DialogTitle>

          {/* Header — title, progress, close. Same 12-unit header height as
              Settings so the two takeovers read as one family. */}
          <header className="flex shrink-0 flex-col gap-3 border-b border-border/60 px-8 pt-6 pb-5">
            <div className="flex items-start gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <h2 className="text-[17px] font-semibold tracking-tight">
                  {tourDone ? "Getting started" : "Welcome to Nexis"}
                </h2>
                <p className="text-[12px] text-muted-foreground">
                  {done === total && total > 0
                    ? "That is the tour of the place. This screen stays in the command palette if you want it again."
                    : "Each row is one thing Nexis does that a terminal does not. Pick any of them — they are not in order."}
                </p>
              </div>

              <DialogPrimitive.Close asChild>
                <button
                  type="button"
                  className="-mt-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                >
                  <Icon name="close" size="sm" />
                  <span className="sr-only">Close</span>
                </button>
              </DialogPrimitive.Close>
            </div>

            <div className="flex items-center gap-3">
              <div
                className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={done}
                aria-valuemin={0}
                aria-valuemax={total}
                aria-label="Onboarding progress"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
                {done} / {total}
              </span>
            </div>
          </header>

          {/* Steps */}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ul className="mx-auto grid w-full max-w-160 grid-cols-1 gap-1.5 sm:grid-cols-2">
              {steps.map((step) => (
                <StepCard
                  key={step.id}
                  step={step}
                  done={doneSet.has(step.id)}
                  onToggle={() => toggle(step)}
                  onRun={() => run(step)}
                />
              ))}
            </ul>
          </div>

          {/* Footer */}
          <footer className="flex shrink-0 items-center gap-3 border-t border-border/60 px-8 py-3">
            <button
              type="button"
              onClick={() => {
                close();
                onStartTour();
              }}
              className="flex items-center gap-1.5 rounded text-[11.5px] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
            >
              <Icon name="play" size="xs" />
              {tourDone ? "Replay the guided tour" : "Start the guided tour"}
            </button>

            <button
              type="button"
              onClick={close}
              className="ml-auto rounded-md bg-primary/90 px-3 py-1.5 text-[11.5px] font-medium text-primary-foreground transition-colors hover:bg-primary focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
            >
              Close
            </button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

function StepCard({
  step,
  done,
  onToggle,
  onRun,
}: {
  step: OnboardingStep;
  done: boolean;
  onToggle: () => void;
  onRun: () => void;
}) {
  const keys = stepKeys(step, MOD_KEY);

  return (
    <li>
      <div
        className={cn(
          "group flex h-full items-start gap-2.5 rounded-lg border border-transparent px-3 py-2.5 transition-colors",
          "hover:border-border/60 hover:bg-primary/[0.05]",
        )}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={`Mark "${step.label}" as ${done ? "not done" : "done"}`}
          onClick={onToggle}
          className={cn(
            "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
            "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
            done
              ? "border-primary/60 bg-primary/20 text-primary"
              : "border-border/70 text-transparent hover:border-primary/40",
          )}
        >
          <Icon name="check" size="xs" />
        </button>

        <button
          type="button"
          onClick={onRun}
          className="flex min-w-0 flex-1 flex-col items-start gap-1 rounded text-left focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
        >
          <span className="flex w-full items-center gap-1.5">
            <Icon
              name={step.icon}
              size="sm"
              className={done ? "text-muted-foreground/50" : "text-primary/80"}
            />
            <span
              className={cn(
                "min-w-0 truncate text-[12.5px] font-medium",
                done && "text-muted-foreground/60 line-through",
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
          <span className="text-[11px] leading-relaxed text-muted-foreground/80">
            {step.why}
          </span>
        </button>
      </div>
    </li>
  );
}
