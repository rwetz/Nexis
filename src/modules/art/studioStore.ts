// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Which SVG Studio tool is in front.
 *
 * The Art pack used to be six sidebar panels. Five of them — palette,
 * backdrop, icon set, favicon set, animator — are one suite with the
 * playground, so they now live inside SVG Studio's tab as a tool strip, and
 * the sidebar keeps only panels you glance at while working.
 *
 * This is a store rather than a field on the tab because the tab is opened
 * from places that cannot reach it — palette commands, the titlebar launcher —
 * and "open the Studio at the palette" must be one call from any of them:
 * `openSvgStudio("palette")` sets the tool, then the caller opens the tab.
 *
 * Session state, not a preference: which tool you were last in is where you
 * were, not a standing choice about the app.
 */

import type { IconName } from "@/components/icon";
import { create } from "zustand";

export const STUDIO_TOOL_IDS = [
  "draw",
  "palette",
  "backdrop",
  "icon-set",
  "favicon",
  "animator",
] as const;

export type StudioTool = (typeof STUDIO_TOOL_IDS)[number];

export const STUDIO_TOOLS: readonly { id: StudioTool; label: string; icon: IconName }[] = [
  { id: "draw", label: "Draw", icon: "brush" },
  { id: "palette", label: "Palette", icon: "theme" },
  { id: "backdrop", label: "Backdrop", icon: "image" },
  { id: "icon-set", label: "Icon Set", icon: "grid" },
  { id: "favicon", label: "Favicon", icon: "rocket" },
  { id: "animator", label: "Animate", icon: "play" },
];

type StudioState = {
  tool: StudioTool;
  setTool: (tool: StudioTool) => void;
};

export const useSvgStudioStore = create<StudioState>((set) => ({
  tool: "draw",
  setTool: (tool) => set({ tool }),
}));
