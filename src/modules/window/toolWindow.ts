// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { currentWorkArea, openOrFocusWindow } from "@/platform/windows";
import { emit } from "@/platform/events";
import { IS_MAC } from "@/lib/platform";
import type { ToolWindowContribution } from "@/workbench/capability";

/**
 * Sent after every open, including a re-focus of a window that already
 * exists. The URL only reaches a window when it is created, so this is how a
 * second "Open the palette" lands in a Studio window that is already up, and
 * how the window knows to replay its entrance.
 */
export const TOOL_WINDOW_OPENED_EVENT = "nexis://tool-window-opened";

export type ToolWindowOpened = {
  id: string;
  params: Record<string, string>;
};

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

/** The launch parameters a tool window was created with (everything but `tool`). */
export function toolWindowParamsFromSearch(search: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(search)) {
    if (key !== "tool") out[key] = value;
  }
  return out;
}

/** Room left on a screen for a window after the taskbar and a margin. */
export type WorkArea = { width: number; height: number };

/**
 * Fit a tool's declared size to the screen it opens on. A tool declares the
 * size it looks best at, but SVG Studio at 900 tall on a 1080p laptop put its
 * layer controls under the taskbar, and a window you have to resize every
 * time you open it is the bug. The minimums give way before the screen does.
 */
export function fitToWorkArea(
  tool: Pick<ToolWindowContribution, "width" | "height" | "minWidth" | "minHeight">,
  area: WorkArea | null,
): { width: number; height: number; minWidth: number; minHeight: number } {
  const want = { width: tool.width, height: tool.height ?? 860 };
  const min = { width: tool.minWidth ?? 720, height: tool.minHeight ?? 500 };
  if (!area) return { ...want, minWidth: min.width, minHeight: min.height };
  const width = Math.max(320, Math.min(want.width, Math.floor(area.width * 0.92)));
  const height = Math.max(320, Math.min(want.height, Math.floor(area.height * 0.9)));
  return {
    width,
    height,
    minWidth: Math.min(min.width, width),
    minHeight: Math.min(min.height, height),
  };
}

/**
 * Focus the existing tool window, or create it once. A tool is an app-level
 * destination, so repeated clicks should never create a pile of duplicates.
 * `params` ride on the URL for a new window and on the opened event for an
 * existing one, so both paths see the same request.
 */
export async function openToolWindow(
  tool: ToolWindowContribution,
  params: Record<string, string> = {},
): Promise<void> {
  const platformOptions = IS_MAC
    ? { titleBarStyle: "overlay" as const, hiddenTitle: true }
    : { decorations: false, transparent: true, shadow: false };
  const query = new URLSearchParams({ tool: tool.id, ...params });

  await openOrFocusWindow(`nexis-${tool.id}`, {
    url: `/?${query.toString()}`,
    title: tool.title,
    center: true,
    ...fitToWorkArea(tool, await currentWorkArea()),
    ...platformOptions,
  });
  await emit<ToolWindowOpened>(TOOL_WINDOW_OPENED_EVENT, { id: tool.id, params }).catch(() => {});
}
