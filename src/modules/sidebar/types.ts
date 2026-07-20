// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/** Source of truth for sidebar view ids — the type is derived from it. */
export const SIDEBAR_VIEW_IDS = [
  "explorer",
  "source-control",
  "processes",
  "system-monitor",
  "ports",
  "profiles",
  "repl",
  "outline",
  "snippets",
  "tests",
  "database",
  "build",
  "ssh",
  "release",
  "recent-files",
  "code-review",
  "agent-queue",
  "share",
  "symbol-search",
  "refactor",
  "prompt-templates",
  "bookmarks",
  "notes",
  "shell-snippets",
  "debugger",
  "ml",
] as const;

export type SidebarViewId = (typeof SIDEBAR_VIEW_IDS)[number];

export function isSidebarViewId(value: unknown): value is SidebarViewId {
  return (
    typeof value === "string" &&
    (SIDEBAR_VIEW_IDS as readonly string[]).includes(value)
  );
}
