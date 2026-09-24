// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Which Web workbench tool is in front, and the views it owns.
 *
 * The Web workbench is where web development lives: the servers you are
 * running (Ports), requests against them (HTTP Client), and the codecs you
 * reach for while doing it (Web Tools). It is a title-bar destination like
 * SVG Studio, somewhere you go and work for a while rather than a panel you
 * glance at, so these views left the sidebar and the bottom panel for one tab.
 *
 * Opening a tool is `requestWebWorkbench(tool)`: it sets the tool and asks
 * App (which owns tabs) to open the tab through a window event, because
 * `persistSidebarView`, the funnel every "open this view" goes through,
 * cannot reach tab state.
 */

import type { IconName } from "@/components/icon";
import { create } from "zustand";

export type WebTool = "ports" | "http-client" | "web-tools";

export const WEB_TOOLS: readonly { id: WebTool; label: string; icon: IconName }[] = [
  { id: "ports", label: "Ports", icon: "network" },
  { id: "http-client", label: "HTTP Client", icon: "globe" },
  { id: "web-tools", label: "Tools", icon: "tools" },
];

export function isWebTool(view: unknown): view is WebTool {
  return WEB_TOOLS.some((t) => t.id === view);
}

export const OPEN_WEB_WORKBENCH_EVENT = "nexis:open-web-workbench";

type State = { tool: WebTool; setTool: (tool: WebTool) => void };

export const useWebWorkbenchStore = create<State>((set) => ({
  tool: "ports",
  setTool: (tool) => set({ tool }),
}));

/** Open the Web workbench tab with `tool` in front. */
export function requestWebWorkbench(tool: WebTool) {
  useWebWorkbenchStore.getState().setTool(tool);
  window.dispatchEvent(new CustomEvent(OPEN_WEB_WORKBENCH_EVENT));
}
