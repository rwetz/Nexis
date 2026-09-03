---
type: subsystem
description: The first-run flow — preset picker, guided tour, and the Getting Started checklist — and why all of it is derived from enabledPacks rather than snapshotted.
---

# Onboarding

One flow in three steps, added 2026-09-03. Entry points: `src/lib/onboarding.ts` (data), `src/modules/onboarding/` (UI), `src/modules/settings/PackOnboardingDialog.tsx` (step 1).

1. **Preset picker** — `PackOnboardingDialog`, gated on `hydrated && !packsOnboarded`. Renders from `PRESETS` in `src/lib/packs.ts`.
2. **Guided tour** — `OnboardingTour`, gated on `packsOnboarded && !onboardingTourDone`. 4–6 coach-marks.
3. **Getting Started checklist** — `GettingStartedPanel`, a core sidebar view (`getting-started`), reachable from the command palette forever.

## The one idea holding it together

**Everything is derived from `enabledPacks` on every render. Only progress is persisted.**

Presets are editable config — Settings → Features can change them at any time — so anything computed once at first run and stored would be orphaned the moment someone changed their preset. A Bare-Bones user who switches to Everything gains the steps for the panels they just turned on, because `checklistFor(enabledPacks)` is recomputed rather than read back.

Two consequences worth knowing:

- The tour filters by pack **and then again by whether the anchor is on screen** (`[data-tour="..."]`). Touring a feature that is switched off is worse than not touring at all; pointing at nothing is worse still.
- Completed step ids that no longer match a visible step are **kept, not pruned**. Toggling a pack off and back on restores ticks already earned.

## The tour is deliberately not a modal

Nothing traps pointer events. The highlight ring is `pointer-events: none` and the card is a small positioned popover, so the app stays usable underneath.

That is a direct reaction to the E2E failure this feature waited behind (see [[e2e-harness]]): a first-run surface that covers the whole viewport is a first-run surface that can wedge the suite. Escape closes it and it carries an accessible name.

Frames are positioned from `getBoundingClientRect` and re-measured on resize/scroll plus a slow interval, because panels resize freely and a coach-mark pointing at stale coordinates is worse than none.

## Completion signalling

Steps complete from wherever the user did the thing, not only from the checklist — someone who opens the agent with the keyboard has done it just as much as someone who clicked the row.

The seam is a DOM event: `signalOnboardingStep(id)` is a bare `dispatchEvent`, and `useOnboardingSignals` is the **single** listener that turns it into a preference write. The alternative — importing the settings store into every module that could complete a step — would put a preference write on the hot path of the terminal and the AI panel.

Current emitters: `App.tsx` (`ai.open`, `workspace.open`, `files.quickOpen`) and `modules/terminal/lib/osc-handlers.ts` (`terminal.run`, on a finished command with a real exit status). Steps the app cannot observe from a distance keep a manual checkbox.

Progress goes through `writePref()`, so it syncs across windows — see [[settings-sync]] and CLAUDE.md pitfall #2.

## Adding a step

Add it to `STEPS` in `src/lib/onboarding.ts`. Give it a `pack` if it targets a gated view (a core step that navigates to a gated view lands the user on the pack-gate placeholder — there is a test for this). Give it `tour: true` and a `tourTarget` only if some chrome carries a matching `data-tour` attribute.

Related: [[expansion-packs]], [[settings-sync]], [[e2e-harness]].
