// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The guided tour: four to six coach-marks over real chrome.
 *
 * Two decisions worth keeping.
 *
 * **It only points at panels the chosen preset actually enabled.** Steps are
 * filtered by pack, and then filtered again by whether the target is on
 * screen — touring a feature that is switched off is worse than not touring at
 * all, and pointing at nothing is worse still.
 *
 * **It is not a modal.** There is no full-viewport overlay and nothing traps
 * pointer events: the highlight ring is `pointer-events: none` and the card is
 * a small positioned popover. That is a deliberate reaction to the E2E failure
 * this feature had to wait on — a first-run surface that covers the whole
 * viewport is a first-run surface that can wedge the suite, and the app stays
 * usable underneath this one. Escape closes it, and it carries an accessible
 * name so a future failure names itself.
 */

import { Icon } from "@/components/icon";
import { tourFor, type OnboardingAction, type OnboardingStep } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setOnboardingTourDone } from "@/modules/settings/store";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  onRunAction: (action: OnboardingAction) => void;
};

type Rect = { top: number; left: number; width: number; height: number };

const CARD_WIDTH = 280;
const GAP = 10;

function rectOf(target: string | undefined): Rect | null {
  if (!target) return null;
  const el = document.querySelector(`[data-tour="${CSS.escape(target)}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  // A zero-size box is an element that is in the DOM but not laid out
  // (a collapsed rail, a hidden overflow row) — treat it as absent.
  if (r.width === 0 || r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function OnboardingTour({ open, onClose, onRunAction }: Props) {
  const enabledPacks = usePreferencesStore((s) => s.enabledPacks);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  // Steps whose target is not rendered right now are dropped rather than
  // shown pointing at nothing. Computed here (not in a selector) so the
  // store snapshot stays a stable reference (pitfall #14).
  const candidates = tourFor(enabledPacks);
  const [steps, setSteps] = useState<readonly OnboardingStep[]>([]);

  useLayoutEffect(() => {
    if (!open) return;
    setSteps(candidates.filter((s) => rectOf(s.tourTarget) !== null));
    setIndex(0);
    // `candidates` is derived from enabledPacks; depending on the packs array
    // rather than the derived list keeps this from re-running every render.
  }, [open, enabledPacks]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = steps[index];

  const finish = useCallback(() => {
    void setOnboardingTourDone(true);
    onClose();
  }, [onClose]);

  // Track the target as the layout moves under us. A tour step that points at
  // stale coordinates is worse than no tour, and panels resize freely here.
  useLayoutEffect(() => {
    if (!open || !step) return;
    const update = () => setRect(rectOf(step.tourTarget));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const id = window.setInterval(update, 500);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.clearInterval(id);
    };
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, finish]);

  if (!open || !step || !rect) return null;

  // Prefer placing the card above the target (the rail sits at the bottom of
  // the window), flipping below only when there is not room.
  const above = rect.top > 180;
  const top = above ? rect.top - GAP : rect.top + rect.height + GAP;
  const left = Math.min(
    Math.max(GAP, rect.left + rect.width / 2 - CARD_WIDTH / 2),
    window.innerWidth - CARD_WIDTH - GAP,
  );

  const isLast = index === steps.length - 1;

  return (
    <>
      {/* Highlight ring. Never intercepts pointer events — the app stays live
          underneath, which is the whole point of not making this a modal. */}
      <div
        aria-hidden
        className="pointer-events-none fixed z-[60] rounded-lg ring-2 ring-primary/70"
        style={{
          top: rect.top - 3,
          left: rect.left - 3,
          width: rect.width + 6,
          height: rect.height + 6,
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.28)",
        }}
      />

      <div
        role="dialog"
        aria-label="Guided tour"
        className="fixed z-[61] flex flex-col gap-2 rounded-xl border border-border bg-popover p-3 shadow-2xl"
        style={{
          top,
          left,
          width: CARD_WIDTH,
          transform: above ? "translateY(-100%)" : undefined,
        }}
      >
        <div className="flex items-center gap-1.5">
          <Icon name={step.icon} size="sm" className="text-primary" />
          <span className="text-[12.5px] font-medium">{step.label}</span>
          <button
            type="button"
            aria-label="Close the guided tour"
            onClick={finish}
            className="ml-auto rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <Icon name="close" size="xs" />
          </button>
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {step.why}
        </p>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground/60">
            {index + 1} of {steps.length}
          </span>

          <button
            type="button"
            onClick={() => onRunAction(step.action)}
            className="ml-auto rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            Show me
          </button>

          {index > 0 && (
            <button
              type="button"
              onClick={() => setIndex((i) => i - 1)}
              className="rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              Back
            </button>
          )}

          <button
            type="button"
            onClick={() => (isLast ? finish() : setIndex((i) => i + 1))}
            className={cn(
              "rounded-md bg-primary/90 px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition-colors",
              "hover:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            )}
          >
            {isLast ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </>
  );
}
