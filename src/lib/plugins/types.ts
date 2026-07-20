// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Nexis First-Party Plugin API — stable internal surface.
 *
 * Rules for this file:
 *  - Types here are the public contract. Never remove or rename an existing
 *    type/field; instead add optional fields or new union members.
 *  - All contribution IDs must be globally unique. By convention use
 *    "plugin-id:contribution-name" (e.g. "python:env-pill").
 *  - Plugins must be pure TypeScript; no dynamic imports from disk.
 */

import type React from "react";
import type { PackId } from "@/lib/packs";
import type { ToolContribution } from "@/modules/ai/tools/plugin-tools";

/** The icon object shape Hugeicons components accept. */
type HugeiconsIconType = Parameters<
  typeof import("@hugeicons/react").HugeiconsIcon
>[0]["icon"];

// ── Disposable ────────────────────────────────────────────────────────────────

/** Cancel / unregister a contribution. Multiple calls are a no-op. */
export type Disposable = {
  dispose: () => void;
};

/** Combine multiple disposables into one. */
export function combineDisposables(...items: Disposable[]): Disposable {
  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const d of items) d.dispose();
    },
  };
}

// ── Contribution: Status-bar item ─────────────────────────────────────────────

export type StatusBarSide = "left" | "right";

export type StatusBarItem = {
  /** Must be globally unique. */
  id: string;
  side: StatusBarSide;
  /**
   * Higher priority = further from the outer edge (towards center).
   * Built-in items use priority 0. Plugin items should use ≥100.
   */
  priority: number;
  /** Returns the React node to render inside the status bar. */
  render: () => React.ReactNode;
};

// ── Contribution: Panel ───────────────────────────────────────────────────────

export type PanelLocation = "bottom" | "sidebar";

/**
 * Rail groups a sidebar panel can be filed under. Mirrors the built-in
 * grouping in `SidebarRail`; a contribution with no group lands in
 * "Advanced", which is where an unclassified extra panel belongs.
 */
export type PanelGroup = "Navigation" | "Code" | "AI" | "Dev Tools" | "Advanced";

export type PanelContribution = {
  id: string;
  title: string;
  location: PanelLocation;
  /** Return the React node to render inside the panel. */
  render: () => React.ReactNode;

  // ── Sidebar presentation (expansion packs V2) ────────────────────────────
  // Ignored for `location: "bottom"`. All optional so an existing
  // contribution keeps working — the rail falls back to a generic icon and
  // the Advanced group.

  /** Hugeicons icon for the rail button. Falls back to a generic panel icon. */
  icon?: HugeiconsIconType;
  /** Rail group. Defaults to "Advanced". */
  group?: PanelGroup;
  /**
   * Expansion pack that owns this panel. `undefined` means core — always
   * available. A panel naming a pack disappears from the rail when that pack
   * is off, exactly like a built-in view (see `src/lib/packs.ts`).
   */
  pack?: PackId;
  /** Sort order within the group; lower first. Defaults to 0. */
  order?: number;
};

// ── Contribution: Agent tool ──────────────────────────────────────────────────

export type {
  ToolApproval,
  ToolContribution,
} from "@/modules/ai/tools/plugin-tools";


// ── Contribution: Command ─────────────────────────────────────────────────────

export type CommandContribution = {
  id: string;
  title: string;
  handler: (...args: unknown[]) => void | Promise<void>;
};

// ── Plugin event bus ──────────────────────────────────────────────────────────

export type PluginEventMap = {
  /** Fired when the active workspace root changes. */
  "workspace:root-changed": string | null;
  /** Fired when the user navigates to a different file. */
  "editor:file-changed": string | null;
  /** Fired when the active terminal tab CWD changes. */
  "terminal:cwd-changed": string | null;
  /** Fired when the active Python env is set. */
  "python:env-changed": { path: string; name: string } | null;
};

export type PluginEvent = keyof PluginEventMap;

// ── Plugin API surface ────────────────────────────────────────────────────────

export type PluginAPI = {
  // Contributions
  registerStatusBarItem(item: StatusBarItem): Disposable;
  registerPanel(panel: PanelContribution): Disposable;
  /**
   * Contribute an agent tool. Admission is enforced when the tool list is
   * built, not here: a contribution that shadows a built-in name, uses an
   * invalid name, or lacks a description is logged and skipped rather than
   * breaking the agent loop. See `modules/ai/tools/plugin-tools.ts`.
   */
  registerTool(tool: ToolContribution): Disposable;
  registerCommand(cmd: CommandContribution): Disposable;

  // Event bus
  emit<K extends PluginEvent>(event: K, data: PluginEventMap[K]): void;
  on<K extends PluginEvent>(
    event: K,
    handler: (data: PluginEventMap[K]) => void,
  ): Disposable;
};

// ── Plugin interface ──────────────────────────────────────────────────────────

export type Plugin = {
  /** Globally unique plugin identifier. */
  id: string;
  /** Human-readable name shown in diagnostics/settings. */
  name: string;
  /** Expansion pack this plugin belongs to (see src/lib/packs.ts). The
   * plugin is only activated while its pack is enabled; omit for plugins
   * that are part of the core surface. */
  pack?: import("@/lib/packs").PackId;
  /**
   * Called once when the app mounts. Register contributions here.
   * Return a Disposable to clean up on unmount (optional).
   */
  activate: (api: PluginAPI) => Disposable | void;
};
