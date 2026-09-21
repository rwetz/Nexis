---
type: decision
description: Sidebar views are sorted by lifetime into four surfaces; the rail holds only contextual views, and pinning is gone.
---

# Views are placed by lifetime, not ranked by importance

**Date:** 2026-09
**Status:** active. All three steps shipped (2026-09-20).

## Context

By 2026-09 the sidebar rail had 34 views in five groups: Navigation, Code, AI, Dev Tools and Advanced. A pin model kept a short strip visible, an overflow popover held the rest, and one-time promotions pushed new views into existing users' strips. Atlas could be reached four ways: rail, overflow, title-bar launcher and palette. "Which of these deserve a permanent spot" had no good answer, because the question was posed at the wrong level. The views are not the same kind of thing, so ranking them never works.

## Decision

Every built-in view has a `kind` in `src/modules/sidebar/viewCatalog.ts`, and the kind decides its home:

| Kind | How you use it | Home |
| --- | --- | --- |
| `contextual` | glance at it while working on a file | the rail |
| `session` | start it, watch it run, it finishes | the bottom panel (`src/modules/bottom-panel/`) |
| `ai` | hand the agent work | the AI window's tool strip (`ai/store/aiToolStore.ts`) |
| `workbench` | go to it and stay a while | title bar (`header/permanentTools.ts`); Ports, HTTP Client and Web Tools share the Web workbench tab (`web-workbench/`) |
| `utility` | invoke it, use it, dismiss it | palette |

The rail is `RAIL_VIEWS`, the contextual views in catalogue order. `viewPaletteCommands` generates a "Show …" command for every view whose owner does not already contribute one, and `pluginPanelCommands` does the same for contributed panels. A contributed panel joins the rail only with `showInRail: true`; the default flipped to false.

Sequencing, each step independent:
1. The art tools moved into SVG Studio's tool strip (see [[art-pack]]).
2. The rail was cut to the contextual views, and pinning, overflow and promotions were deleted.
3. The bottom panel hosts the session views. Build, test and debug output is line-oriented and reads badly in a 280px rail. It grew out of the Problems drawer, in the same slot, and Problems is its first tab.

## Alternatives rejected

- **Better grouping in the overflow menu.** That was tried: the menu got a drawn trunk-and-elbow tree (`BranchedMenu`). It made the categories legible and left the problem untouched.
- **Keep pinning and just change the defaults.** Pinning exists only because the list does not fit. Once the list fits, it is three ways to reach a panel where one will do.

## Consequences

- Adding a view id fails to typecheck until it has a catalogue entry. That entry forces the kind decision, and the kind decides where the view appears.
- A view opened from the palette still renders in the sidebar and shows as a transient rail item after a divider while it is active. Without that, the rail would mark nothing while a panel sat open.
- Onboarding coach-marks may point at `sidebar-<view>` only for rail views. `onboarding.test.ts` enforces this. Build's coach-mark now points at the title-bar search (`data-tour="spotlight"`).
- The title bar should not grow past its workbenches. If something feels like it needs a permanent spot, ask what its lifetime is first.

## The bottom panel

`src/modules/bottom-panel/`, docked by `PanelDock` under the workspace, across the full width right of the sidebar.

- **It is not a react-resizable-panels group, on purpose.** The first build put it in App's vertical group and read open/closed/maximized back out of `onResize` ("zero means the user dragged it shut"). A newly added panel reports transient sizes while the group settles, so the store and the layout chased each other, and Ctrl+J blanked the whole window (root unmount). `PanelDock` is a plain flex column: the store says open, closed, maximized and a pixel height, and nothing flows from layout back into state. Do not move it back into a group.
- **Routing is one line in one place.** `persistSidebarView` asks `isBottomView` and hands sessions to `useBottomPanelStore.show`; `isAiTool` goes to `showAiTool`; `isWebTool` goes to `requestWebWorkbench`. Palette commands, capability `panels.activate`, the `nexis:open-sidebar-view` event, onboarding and the status bar all already went through that funnel. Stored sidebar selections naming any of these are healed on read (`readSidebarView`).
- **Nothing unmounts once shown.** Tabs mount on first view and stay mounted behind `invisible` + `inert` (never `display: none`, because several panels measure themselves). The dock mounts on first open (`everOpened`) and closing, or zen mode, sets its height to 0.
- **Maximize is an overlay** over the workspace, so no terminal is resized. `rendererPool` also ignores a zero-size container, as a guard.
- **Drag deltas are divided by the zoom ratio** (`getBoundingClientRect().height / offsetHeight`), because the dock sits under `.zoom-content` (pitfall #15's class). An unmeasured column (0) means no ceiling, not a ceiling of zero.
- **Tab dots are reported, not lifted.** Build and Tests call `useReportSessionStatus`; `useSessionAutoReveal` reports the debugger and opens the panel only on a session's *start*.
- **Ctrl/Cmd+J** (`panel.toggle`) is global, so it takes precedence over a terminal's Ctrl+J. The status bar's `PanelToggle` is the pointer's way in.
- **Contributed sessions** use `location: "bottom"` (Debugger, Database, SSH). HTTP Client and Ports went back to `"sidebar"`, meaning placement is decided elsewhere: their home is the Web workbench, which resolves contributions by `legacyView` regardless of location.

## The AI window's tools

Agent Queue, AI Refactor, Prompt Templates and Code Review are `kind: "ai"`, and they render in `AiMiniWindow` behind `AiToolStrip`. Chat stays mounted under the others. Their hand-offs call `showAiChat()`. **Never `useChatStore.openPanel()`**: it targets `DockedAiPanel`, which is not mounted anywhere, so it silently shows nothing. That was the state of all five hand-offs before this change.

## The Web workbench

Ports, HTTP Client and Web Tools share one reusable `web` tab (`web-workbench/`), launched from the title bar (`PERMANENT_TOOLS`, gated on the web-dev pack). Each tool is gated by its own contribution's pack, so Ports (dev-tools) still works without web-dev. `requestWebWorkbench` reaches App's tab state through `OPEN_WEB_WORKBENCH_EVENT`, because the routing funnel cannot see tabs.

Open work: the session panels were laid out for a 280px column and stretch in the panel. System Monitor and Database want wide layouts.
