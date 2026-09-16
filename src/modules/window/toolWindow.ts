// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { openOrFocusWindow } from "@/platform/windows";
import { IS_MAC } from "@/lib/platform";
import type { ToolWindowContribution } from "@/workbench/capability";

/** Read the dedicated-tool route without letting an arbitrary query open a view. */
export function toolWindowFromSearch(
  search: string,
  contributions: readonly ToolWindowContribution[],
): ToolWindowContribution | null {
  const value = new URLSearchParams(search).get("tool");
  return contributions.find((item) => item.id === value) ?? null;
}

export function currentToolWindow(
  contributions: readonly ToolWindowContribution[],
): ToolWindowContribution | null {
  return typeof window === "undefined"
    ? null
    : toolWindowFromSearch(window.location.search, contributions);
}

/**
 * Focus the existing tool window, or create it once. A tool is an app-level
 * destination, so repeated clicks should never create a pile of duplicates.
 */
export async function openToolWindow(tool: ToolWindowContribution): Promise<void> {
  const platformOptions = IS_MAC
    ? { titleBarStyle: "overlay" as const, hiddenTitle: true }
    : { decorations: false, transparent: true, shadow: false };

  await openOrFocusWindow(`nexis-${tool.id}`, {
    url: `/?tool=${encodeURIComponent(tool.id)}`,
    title: tool.title,
    width: tool.width,
    height: tool.height ?? 860,
    minWidth: tool.minWidth ?? 720,
    minHeight: tool.minHeight ?? 500,
    ...platformOptions,
  });
}
