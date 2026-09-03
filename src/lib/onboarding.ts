// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Onboarding as a function of configuration, not a snapshot of first run.
 *
 * The checklist and the tour are both *derived* from `enabledPacks` every time
 * they render. That is the load-bearing decision here: presets are editable
 * config (Settings → Features), so anything computed once at first run and
 * stored would be orphaned the moment someone changed their preset — a
 * Bare-Bones user who switches to Everything would keep a five-item checklist
 * that never mentions the panels they just turned on.
 *
 * Only *progress* is persisted, as a set of completed step ids. Ids that no
 * longer exist are ignored rather than pruned, so turning a pack off and back
 * on restores the ticks the user already earned instead of resetting them.
 *
 * The order below is deliberate: **the agent surface comes first.** People
 * already know what a terminal is; the AI/agent surface is both the
 * differentiator and the least discoverable thing in the app, and burying it
 * under "open a folder" wastes the one screen where attention is guaranteed.
 */

import type { IconName } from "@/components/icon";
import { packEnabled, type PackId } from "@/lib/packs";
import type { SettingsTab } from "@/modules/settings/openSettingsWindow";
import type { SidebarViewId } from "@/modules/sidebar/types";

/**
 * What a step asks the app to do when the user activates it from the
 * checklist or the tour. Kept as data rather than as a closure so this module
 * stays free of React and of App.tsx's callback graph — the panel maps these
 * onto the handlers it already has.
 */
export type OnboardingAction =
  | { kind: "ai-panel" }
  | { kind: "new-terminal" }
  | { kind: "open-folder" }
  | { kind: "quick-open" }
  | { kind: "sidebar"; view: SidebarViewId }
  | { kind: "settings"; section?: SettingsTab };

export type OnboardingStep = {
  id: string;
  label: string;
  /** One line on why this is worth doing — not a restatement of the label. */
  why: string;
  icon: IconName;
  /** Keys shown beside the row, already in display form. */
  keys?: readonly string[];
  action: OnboardingAction;
  /** Pack that must be enabled for this step to appear. Core steps omit it. */
  pack?: PackId;
  /** Steps shown in the tour as well as the checklist, in this order. */
  tour?: boolean;
  /**
   * Element the tour anchors its coach-mark to, matched against
   * `[data-tour="..."]`. A step whose target is not on screen is skipped
   * rather than pointed at nothing.
   */
  tourTarget?: string;
};

/**
 * Every step Nexis knows about. `MOD` is substituted for the platform
 * modifier at render time so this module needs no platform import.
 */
const STEPS: readonly OnboardingStep[] = [
  {
    id: "ai.open",
    label: "Open the AI agent",
    why: "It reads your files and runs commands — this is the part that is not just a terminal.",
    icon: "ai-chat",
    keys: ["MOD", "I"],
    action: { kind: "ai-panel" },
    tour: true,
    tourTarget: "ai-panel-toggle",
  },
  {
    id: "ai.turn",
    label: "Send it a first request",
    why: "Ask it something about the code you have open; it answers with the workspace in context.",
    icon: "chat-ai",
    action: { kind: "ai-panel" },
  },
  {
    id: "ai.approve",
    label: "Approve a tool call",
    why: "The agent asks before it writes or runs anything. Approving once shows you where that line is.",
    icon: "check-box",
    action: { kind: "ai-panel" },
  },
  {
    id: "workspace.open",
    label: "Open a workspace folder",
    why: "Files, Source Control and the agent all scope themselves to it.",
    icon: "folder-open",
    action: { kind: "open-folder" },
    tour: true,
    tourTarget: "sidebar-explorer",
  },
  {
    id: "terminal.run",
    label: "Run a command",
    why: "Nexis marks each command's exit status in the gutter, so failures are visible without scrolling.",
    icon: "terminal",
    keys: ["MOD", "T"],
    action: { kind: "new-terminal" },
    tour: true,
    tourTarget: "tab-new",
  },
  {
    id: "files.quickOpen",
    label: "Jump to a file",
    why: "Fuzzy match on the whole workspace — faster than the tree once you know a filename.",
    icon: "search",
    keys: ["MOD", "P"],
    action: { kind: "quick-open" },
  },
  {
    id: "scm.commit",
    label: "Make a commit",
    why: "Stage and commit without leaving the app; the diff pane is the same one the agent writes into.",
    icon: "git-branch",
    action: { kind: "sidebar", view: "source-control" },
    tour: true,
    tourTarget: "sidebar-source-control",
  },
  {
    id: "build.run",
    label: "Run a build or test task",
    why: "Nexis detects the project's runner, so the task list is not something you configure first.",
    icon: "tools",
    action: { kind: "sidebar", view: "build" },
    pack: "code-tools",
    tour: true,
    tourTarget: "sidebar-build",
  },
  {
    id: "sysmon.open",
    label: "Watch system resources",
    why: "CPU, memory and the process table, without a second app open beside this one.",
    icon: "cpu",
    action: { kind: "sidebar", view: "system-monitor" },
    pack: "dev-tools",
  },
  {
    id: "db.connect",
    label: "Connect a database",
    why: "Query and browse schemas in the same window as the code that talks to them.",
    icon: "database",
    action: { kind: "sidebar", view: "database" },
    pack: "dev-tools",
  },
  {
    id: "ml.open",
    label: "Open the ML Lab",
    why: "Train and inspect a small model locally — no notebook server, no cloud account.",
    icon: "brain",
    action: { kind: "sidebar", view: "ml" },
    pack: "ml-lab",
  },
  {
    id: "packs.tune",
    label: "Tune which panels you see",
    why: "Your preset was only a starting point — every pack is a switch you can flip later.",
    icon: "settings",
    action: { kind: "settings", section: "features" },
    tour: true,
    tourTarget: "sidebar-overflow",
  },
];

/** The checklist for a pack configuration, in presentation order. */
export function checklistFor(
  enabledPacks: readonly PackId[],
): readonly OnboardingStep[] {
  return STEPS.filter((s) => packEnabled(s.pack, enabledPacks));
}

/**
 * The tour, capped at six steps.
 *
 * Touring a feature that is switched off is worse than not touring at all, so
 * this filters by pack exactly as the checklist does. The cap is a real
 * constraint rather than a coincidence of the current data: a tour that
 * outlasts someone's patience is skipped wholesale, taking the useful early
 * steps with it.
 */
export const MAX_TOUR_STEPS = 6;

export function tourFor(
  enabledPacks: readonly PackId[],
): readonly OnboardingStep[] {
  return checklistFor(enabledPacks)
    .filter((s) => s.tour)
    .slice(0, MAX_TOUR_STEPS);
}

/** Progress over the steps that are currently visible. */
export function onboardingProgress(
  enabledPacks: readonly PackId[],
  completed: readonly string[],
): { done: number; total: number } {
  const steps = checklistFor(enabledPacks);
  const set = new Set(completed);
  return {
    done: steps.filter((s) => set.has(s.id)).length,
    total: steps.length,
  };
}

/** Substitute the platform modifier into a step's key hints. */
export function stepKeys(
  step: OnboardingStep,
  modKey: string,
): readonly string[] | undefined {
  return step.keys?.map((k) => (k === "MOD" ? modKey : k));
}

// ── Completion signalling ───────────────────────────────────────────────────

/**
 * Steps are marked done from wherever the user actually did the thing, not
 * only from the checklist — someone who opens the agent with the keyboard has
 * done the step just as much as someone who clicked the row.
 *
 * A DOM event is the seam because the alternative is importing the settings
 * store into every module that could complete a step, which would put a
 * preference write on the hot path of the terminal and the AI panel. The
 * listener lives in one place (`useOnboardingSignals`) and does the write.
 */
export const ONBOARDING_STEP_EVENT = "nexis:onboarding-step";

/** Announce that a step has been performed. Cheap, and safe to call often. */
export function signalOnboardingStep(id: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(ONBOARDING_STEP_EVENT, { detail: id }),
  );
}

/** Ids this module knows about — used to ignore stray or stale events. */
export function isOnboardingStepId(value: unknown): value is string {
  return typeof value === "string" && STEPS.some((s) => s.id === value);
}
