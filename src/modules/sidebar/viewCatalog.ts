// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Every built-in sidebar view, and what kind of thing it is.
 *
 * The rail used to hold 34 items in five groups behind a pin model: pin what
 * you use, find the rest in an overflow menu. That was a categorisation answer
 * to a problem that is really about *lifetime*. The views are not the same
 * kind of thing, and one surface was pretending to serve four jobs:
 *
 * | Kind         | How you use it                        | Home                 |
 * | ------------ | ------------------------------------- | -------------------- |
 * | `contextual` | glance at it while working on a file  | the rail             |
 * | `session`    | start it, watch it run, it finishes   | palette (bottom panel next) |
 * | `workbench`  | go to it and stay a while             | the title bar        |
 * | `utility`    | invoke it, use it, dismiss it         | the palette          |
 *
 * So the rail is exactly the contextual views, in a fixed order, and there is
 * no pinning, no overflow and no promotion machinery — the thing those existed
 * to manage is gone. Every non-rail view gets a generated "Show …" palette
 * command from this table unless its owner already contributes one.
 *
 * `Record<SidebarViewId, …>` is deliberate: adding a view id without deciding
 * what kind of thing it is fails to typecheck.
 */

import type { IconName } from "@/components/icon";
import type { CommandDef } from "@/components/CommandPalette";
import { packForView } from "@/lib/packs";
import { SIDEBAR_VIEW_IDS, type SidebarViewId } from "./types";

export type ViewKind = "contextual" | "session" | "workbench" | "utility";

export type ViewEntry = {
  label: string;
  icon: IconName;
  kind: ViewKind;
  keywords?: string[];
  /**
   * False when the view's owner already contributes its own palette command
   * (a capability, or a hand-written one in App with established keybinding
   * ids). A generated duplicate would put two rows in the palette.
   */
  command?: false;
};

export const VIEW_CATALOG: Record<SidebarViewId, ViewEntry> = {
  // ── Contextual — the rail, in this order ────────────────────────────────
  explorer:          { label: "Files",            icon: "explorer",     kind: "contextual", command: false },
  "source-control":  { label: "Source Control",   icon: "folder-git",   kind: "contextual", command: false },
  outline:           { label: "Outline",          icon: "outline",      kind: "contextual", keywords: ["symbols", "structure"] },
  "symbol-search":   { label: "Symbol Search",    icon: "search-code",  kind: "contextual", keywords: ["symbol", "definition", "workspace"] },
  bookmarks:         { label: "Bookmarks",        icon: "bookmark-add", kind: "contextual" },
  "recent-files":    { label: "Recent Files",     icon: "clock",        kind: "contextual", keywords: ["history", "mru"] },

  // ── Sessions — run and watch ────────────────────────────────────────────
  build:             { label: "Build",            icon: "wrench",       kind: "session", keywords: ["task", "compile", "run"] },
  tests:             { label: "Tests",            icon: "test",         kind: "session", keywords: ["test runner", "spec"] },
  debugger:          { label: "Debugger",         icon: "debug",        kind: "session", keywords: ["dap", "breakpoint", "debug"] },
  processes:         { label: "Activity",         icon: "tasks",        kind: "session", command: false },
  "agent-queue":     { label: "Agent Queue",      icon: "tasks",        kind: "session", keywords: ["agents", "background", "queue"] },
  ports:             { label: "Ports",            icon: "network",      kind: "session", keywords: ["listening", "localhost"] },
  repl:              { label: "REPL",             icon: "terminal",     kind: "session", keywords: ["python", "node", "interactive"] },
  database:          { label: "Database",         icon: "database",     kind: "session", keywords: ["sql", "query", "schema"] },
  ssh:               { label: "SSH",              icon: "terminal",     kind: "session", keywords: ["remote", "server"] },
  "http-client":     { label: "HTTP Client",      icon: "network",      kind: "session", command: false },
  "command-history": { label: "Command History",  icon: "clock",        kind: "session", command: false },
  "system-monitor":  { label: "System Monitor",   icon: "cpu",          kind: "session", command: false },

  // ── Workbenches — the title bar ─────────────────────────────────────────
  ml:                { label: "ML Lab",           icon: "brain",        kind: "workbench", command: false },
  "svg-playground":  { label: "SVG Studio",       icon: "brush",        kind: "workbench", command: false },
  atlas:             { label: "Atlas",            icon: "globe",        kind: "workbench", command: false },
  benchmark:         { label: "Benchmark",        icon: "activity",     kind: "workbench", command: false },

  // ── Utilities — the palette ─────────────────────────────────────────────
  snippets:          { label: "Snippets",         icon: "file-code",    kind: "utility" },
  "shell-snippets":  { label: "Shell Snippets",   icon: "terminal",     kind: "utility" },
  "prompt-templates":{ label: "Prompt Templates", icon: "flash",        kind: "utility", keywords: ["ai", "prompt"] },
  refactor:          { label: "AI Refactor",      icon: "magic",        kind: "utility", keywords: ["ai", "rewrite"] },
  "code-review":     { label: "Code Review",      icon: "code-box",     kind: "utility", keywords: ["ai", "review", "diff"] },
  notes:             { label: "Workspace Notes",  icon: "note",         kind: "utility" },
  share:             { label: "Share",            icon: "globe",        kind: "utility", keywords: ["lan", "terminal", "broadcast"] },
  release:           { label: "Release",          icon: "rocket",       kind: "utility", keywords: ["version", "tag", "changelog"] },
  profiles:          { label: "Profiles",         icon: "layers",       kind: "utility", keywords: ["shell", "terminal profile"] },
  "web-tools":       { label: "Web Tools",        icon: "tools",        kind: "utility", command: false },
};

/** The rail, in order: the contextual views and nothing else. Order is the
 *  catalogue's own key order, so reordering the rail is moving a line above. */
export const RAIL_VIEWS: readonly SidebarViewId[] = (
  Object.keys(VIEW_CATALOG) as SidebarViewId[]
).filter((id) => VIEW_CATALOG[id].kind === "contextual");

/**
 * A "Show …" palette command for every view that has no other way in.
 *
 * Contextual views get one too: the rail is for the pointer, the palette for
 * the keyboard, and a view reachable by only one of them is half-reachable.
 */
export function viewPaletteCommands(
  open: (view: SidebarViewId) => void,
): CommandDef[] {
  return SIDEBAR_VIEW_IDS.flatMap((id) => {
    const entry = VIEW_CATALOG[id];
    if (entry.command === false) return [];
    return [{
      id: `view.${id}`,
      label: `Show ${entry.label}`,
      category: "View",
      icon: entry.icon,
      keywords: [entry.label.toLowerCase(), ...(entry.keywords ?? [])],
      pack: packForView(id) ?? undefined,
      action: () => open(id),
    }];
  });
}
