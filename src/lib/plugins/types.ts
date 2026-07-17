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

export type PanelContribution = {
  id: string;
  title: string;
  location: PanelLocation;
  /** Return the React node to render inside the panel. */
  render: () => React.ReactNode;
};

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
