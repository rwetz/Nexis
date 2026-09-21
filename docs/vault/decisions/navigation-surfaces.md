---
type: decision
description: Sidebar views are sorted by lifetime into four surfaces; the rail holds only contextual views, and pinning is gone.
---

# Views are placed by lifetime, not ranked by importance

**Date:** 2026-09
**Status:** active. Steps 1–2 shipped; step 3 (the bottom panel) is planned.

## Context

By 2026-09 the sidebar rail had 34 views in five groups: Navigation, Code, AI, Dev Tools and Advanced. A pin model kept a short strip visible, an overflow popover held the rest, and one-time promotions pushed new views into existing users' strips. Atlas could be reached four ways: rail, overflow, title-bar launcher and palette. "Which of these deserve a permanent spot" had no good answer, because the question was posed at the wrong level. The views are not the same kind of thing, so ranking them never works.

## Decision

Every built-in view has a `kind` in `src/modules/sidebar/viewCatalog.ts`, and the kind decides its home:

| Kind | How you use it | Home |
| --- | --- | --- |
| `contextual` | glance at it while working on a file | the rail |
| `session` | start it, watch it run, it finishes | palette for now; bottom panel planned |
| `workbench` | go to it and stay a while | title bar (`header/permanentTools.ts`) |
| `utility` | invoke it, use it, dismiss it | palette |

The rail is `RAIL_VIEWS`, the contextual views in catalogue order. `viewPaletteCommands` generates a "Show …" command for every view whose owner does not already contribute one, and `pluginPanelCommands` does the same for contributed panels. A contributed panel joins the rail only with `showInRail: true`; the default flipped to false.

Sequencing, each step independent:
1. The art tools moved into SVG Studio's tool strip (see [[art-pack]]).
2. The rail was cut to the contextual views, and pinning, overflow and promotions were deleted.
3. A bottom panel will host the session views. Build, test and debug output is line-oriented and reads badly in a 280px rail. Problems already lives in a bottom drawer under the editor, which is where this starts.

## Alternatives rejected

- **Better grouping in the overflow menu.** That was tried: the menu got a drawn trunk-and-elbow tree (`BranchedMenu`). It made the categories legible and left the problem untouched.
- **Keep pinning and just change the defaults.** Pinning exists only because the list does not fit. Once the list fits, it is three ways to reach a panel where one will do.

## Consequences

- Adding a view id fails to typecheck until it has a catalogue entry. That entry forces the kind decision, and the kind decides where the view appears.
- A view opened from the palette still renders in the sidebar and shows as a transient rail item after a divider while it is active. Without that, the rail would mark nothing while a panel sat open.
- Onboarding coach-marks may point at `sidebar-<view>` only for rail views. `onboarding.test.ts` enforces this. Build's coach-mark now points at the title-bar search (`data-tour="spotlight"`).
- The title bar should not grow past its workbenches. If something feels like it needs a permanent spot, ask what its lifetime is first.
