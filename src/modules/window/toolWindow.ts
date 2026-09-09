// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { IS_MAC } from "@/lib/platform";

/** Top-level Nexis tools that deserve their own focused window. */
export const TOOL_WINDOW_KINDS = ["atlas", "benchmark"] as const;
export type ToolWindowKind = (typeof TOOL_WINDOW_KINDS)[number];

const TOOL_WINDOW_LABEL: Record<ToolWindowKind, string> = {
  atlas: "nexis-atlas",
  benchmark: "nexis-benchmark",
};

const TOOL_WINDOW_TITLE: Record<ToolWindowKind, string> = {
  atlas: "Atlas — Nexis",
  benchmark: "Benchmark — Nexis",
};

/** Read the dedicated-tool route without letting an arbitrary query open a view. */
export function toolWindowKindFromSearch(search: string): ToolWindowKind | null {
  const value = new URLSearchParams(search).get("tool");
  return TOOL_WINDOW_KINDS.includes(value as ToolWindowKind)
    ? (value as ToolWindowKind)
    : null;
}

export function currentToolWindowKind(): ToolWindowKind | null {
  return typeof window === "undefined" ? null : toolWindowKindFromSearch(window.location.search);
}

/**
 * Focus the existing tool window, or create it once. A tool is an app-level
 * destination, so repeated clicks should never create a pile of duplicates.
 */
export async function openToolWindow(kind: ToolWindowKind): Promise<void> {
  const label = TOOL_WINDOW_LABEL[kind];
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.show();
    await existing.setFocus();
    return;
  }

  const platformOptions = IS_MAC
    ? { titleBarStyle: "overlay" as const, hiddenTitle: true }
    : { decorations: false, transparent: true, shadow: false };

  const win = new WebviewWindow(label, {
    url: `/?tool=${kind}`,
    title: TOOL_WINDOW_TITLE[kind],
    width: kind === "atlas" ? 1440 : 1280,
    height: 860,
    minWidth: 720,
    minHeight: 500,
    ...platformOptions,
  });

  win.once("tauri://error", (event) => {
    console.error(`[nexis] Failed to open ${kind}:`, event);
  });
}
