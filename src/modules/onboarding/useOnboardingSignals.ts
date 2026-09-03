// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Records checklist progress from wherever the user actually did the thing.
 *
 * Someone who opens the agent with the keyboard has completed that step just
 * as much as someone who clicked the row in the panel, and a checklist that
 * only ticks when you use the checklist is a checklist nobody trusts.
 *
 * This is the single listener for `ONBOARDING_STEP_EVENT`. Keeping it in one
 * place is the point: the alternative is importing the preferences store into
 * every module that could complete a step, which would put a preference write
 * on the hot path of the terminal and the AI panel. Emitters call
 * `signalOnboardingStep(id)`, which is a bare `dispatchEvent`.
 */

import {
  isOnboardingStepId,
  ONBOARDING_STEP_EVENT,
} from "@/lib/onboarding";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setOnboardingCompleted } from "@/modules/settings/store";
import { useEffect } from "react";

export function useOnboardingSignals(): void {
  const hydrated = usePreferencesStore((s) => s.hydrated);

  useEffect(() => {
    // Before hydration the completed list is the default empty array, and
    // writing against it would clobber whatever is on disk.
    if (!hydrated) return;

    const onStep = (e: Event) => {
      const id = (e as CustomEvent<unknown>).detail;
      if (!isOnboardingStepId(id)) return;

      // Read through getState() rather than closing over the value: several
      // signals can land in one tick, and a stale closure would drop all but
      // the last of them.
      const current = usePreferencesStore.getState().onboardingCompleted;
      if (current.includes(id)) return;
      void setOnboardingCompleted([...current, id]);
    };

    window.addEventListener(ONBOARDING_STEP_EVENT, onStep);
    return () => window.removeEventListener(ONBOARDING_STEP_EVENT, onStep);
  }, [hydrated]);
}
