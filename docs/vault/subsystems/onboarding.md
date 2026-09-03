---
type: subsystem
description: The first-run flow — preset picker, the full-window Getting Started takeover, and the guided tour it launches — and why all of it is derived from enabledPacks rather than snapshotted.
---

# Onboarding

One flow in three steps, added 2026-09-03. Entry points: `src/lib/onboarding.ts` (data), `src/modules/onboarding/` (UI), `src/modules/settings/PackOnboardingDialog.tsx` (step 1).

1. **Preset picker** — `PackOnboardingDialog`, gated on `hydrated && !packsOnboarded`. Renders from `PRESETS` in `src/lib/packs.ts`.
2. **Getting Started takeover** — `OnboardingDialog`, opened on `packsOnboarded && !onboardingTourDone`. A full-window modal, the same shape as Settings and the shortcut reference. Its open state is a store (`onboardingDialogStore.ts`), not App state, because the welcome screen and the command palette both open it from outside App's render tree.
3. **Guided tour** — `OnboardingTour`, 4–6 coach-marks, launched *from* the takeover rather than firing on its own.

The checklist used to be a sidebar view (`getting-started`). It is not any more: it described the app's chrome from inside a ~300px slice of that chrome, which left no room for the one-line *why* that is the point of each row. Both halves of the saved state migrate — `readSidebarView` remaps a stored `getting-started` to the explorer, and `SidebarRail`'s `RETIRED_VIEWS` strips it from a saved pin list — because a retired id merely dropped from the union renders as a gap with no label.

## The one idea holding it together

**Everything is derived from `enabledPacks` on every render. Only progress is persisted.**

Presets are editable config — Settings → Features can change them at any time — so anything computed once at first run and stored would be orphaned the moment someone changed their preset. A Bare-Bones user who switches to Everything gains the steps for the panels they just turned on, because `checklistFor(enabledPacks)` is recomputed rather than read back.

Two consequences worth knowing:

- The tour filters by pack **and then again by whether the anchor is on screen** (`[data-tour="..."]`). Touring a feature that is switched off is worse than not touring at all; pointing at nothing is worse still.
- Completed step ids that no longer match a visible step are **kept, not pruned**. Toggling a pack off and back on restores ticks already earned.

## The tour is deliberately not a modal — but the takeover is

Nothing in the *tour* traps pointer events. The highlight ring is `pointer-events: none` and the card is a small positioned popover, so the app stays usable underneath. Escape closes it and it carries an accessible name.

The takeover in front of it **is** a Radix modal, and that changes what the E2E suite has to do. A `fixed inset-0` overlay answers every click meant for app chrome — the exact failure [[e2e-harness]] documents for the preset picker. So `e2e/wdio.conf.ts` seeds **`onboardingTourDone: true`** alongside `packsOnboarded`, and must keep doing so.

**Why the tour no longer fires by itself:** the same coach-marks are better as something chosen than something dismissed. The takeover's primary action starts it, labelled "Start the guided tour" until it has been run once and "Replay the guided tour" after.

`onboardingTourDone` is written when the takeover **closes**, not when it opens, so a crash mid-first-run does not silently cost someone their one automatic showing. Every exit routes through one `close()` — Escape, the overlay, the X, the footer button, and running a step (a step closes first, because "Open the AI agent" otherwise opens a panel nobody can see).

Frames are positioned from `getBoundingClientRect` and re-measured on resize/scroll plus a slow interval, because panels resize freely and a coach-mark pointing at stale coordinates is worse than none.

## Completion signalling

Steps complete from wherever the user did the thing, not only from the checklist — someone who opens the agent with the keyboard has done it just as much as someone who clicked the row.

The seam is a DOM event: `signalOnboardingStep(id)` is a bare `dispatchEvent`, and `useOnboardingSignals` is the **single** listener that turns it into a preference write. The alternative — importing the settings store into every module that could complete a step — would put a preference write on the hot path of the terminal and the AI panel.

Current emitters: `App.tsx` (`ai.open`, `workspace.open`, `files.quickOpen`) and `modules/terminal/lib/osc-handlers.ts` (`terminal.run`, on a finished command with a real exit status). Steps the app cannot observe from a distance keep a manual checkbox.

Progress goes through `writePref()`, so it syncs across windows — see [[settings-sync]] and CLAUDE.md pitfall #2.

## Adding a step

Add it to `STEPS` in `src/lib/onboarding.ts`. Give it a `pack` if it targets a gated view (a core step that navigates to a gated view lands the user on the pack-gate placeholder — there is a test for this). Give it `tour: true` and a `tourTarget` only if some chrome carries a matching `data-tour` attribute.

Reachable forever from: the welcome screen ("View onboarding"), the command palette ("Open Getting Started"), and the tour footer.

Related: [[expansion-packs]], [[settings-sync]], [[e2e-harness]].
