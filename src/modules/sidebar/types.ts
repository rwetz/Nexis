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
  "svg-playground",
  "palette",
  "backdrop",
  "icon-set",
  "web-tools",
  "http-client",
] as const;

export type SidebarViewId = (typeof SIDEBAR_VIEW_IDS)[number];

export function isSidebarViewId(value: unknown): value is SidebarViewId {
  return (
    typeof value === "string" &&
    (SIDEBAR_VIEW_IDS as readonly string[]).includes(value)
  );
}

// ── Registry-contributed views (expansion packs V2) ──────────────────────────

/** Namespace separating plugin panel views from the built-in id union. */
const PLUGIN_VIEW_PREFIX = "plugin:";

/**
 * A sidebar view backed by a `PanelContribution` in the plugin registry.
 *
 * Namespacing rather than widening `SidebarViewId` to `string` is the whole
 * point: the built-in union stays closed and exhaustively checkable, a plugin
 * can never shadow or collide with a built-in view, and persisted state can
 * be validated without consulting the registry — which matters because view
 * state is restored from localStorage *before* any plugin has registered.
 */
export type PluginPanelViewId = `${typeof PLUGIN_VIEW_PREFIX}${string}`;

/** Any selectable sidebar view: a built-in, or a registry-contributed panel. */
export type SidebarView = SidebarViewId | PluginPanelViewId;

/** The view id for a panel contribution's `id`. */
export function pluginPanelViewId(panelId: string): PluginPanelViewId {
  return `${PLUGIN_VIEW_PREFIX}${panelId}`;
}

/** The contribution id behind a plugin view, or null if it isn't one. */
export function panelIdFromView(view: string): string | null {
  return view.startsWith(PLUGIN_VIEW_PREFIX)
    ? view.slice(PLUGIN_VIEW_PREFIX.length)
    : null;
}

export function isPluginPanelViewId(value: unknown): value is PluginPanelViewId {
  return (
    typeof value === "string" &&
    value.startsWith(PLUGIN_VIEW_PREFIX) &&
    value.length > PLUGIN_VIEW_PREFIX.length
  );
}

export function isSidebarView(value: unknown): value is SidebarView {
  return isSidebarViewId(value) || isPluginPanelViewId(value);
}
