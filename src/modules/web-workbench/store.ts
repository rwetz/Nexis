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
 * glance at, so these views left the sidebar and the bottom panel for their
 * own window.
 *
 * Opening a tool is `requestWebWorkbench(tool)`. The window is a separate
 * webview with its own copy of this store, so the tool rides along as a launch
 * parameter (`?web=<tool>`) and the window applies it; the local `setTool`
 * only matters inside that window.
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

type State = { tool: WebTool; setTool: (tool: WebTool) => void };

export const useWebWorkbenchStore = create<State>((set) => ({
  tool: "ports",
  setTool: (tool) => set({ tool }),
}));

/**
 * Open the Web window with `tool` in front. Handled by App, which knows the
 * workspace root the window should start with.
 */
export const OPEN_WEB_WORKBENCH_EVENT = "nexis:open-web-workbench";

export function requestWebWorkbench(tool: WebTool) {
  window.dispatchEvent(new CustomEvent<WebTool>(OPEN_WEB_WORKBENCH_EVENT, { detail: tool }));
}
