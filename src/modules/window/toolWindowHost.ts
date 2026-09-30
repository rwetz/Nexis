// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * What a companion tool window borrows from the main window.
 *
 * A tool window is its own webview with its own React root: no tabs, no
 * workspace, no terminal. SVG Studio, ML Lab, Web and Documents all read the
 * workspace root, and a few of their buttons end in a place only the main
 * window has (a file tab, a preview tab, an SSH session). So the root flows
 * out of the main window as an event, and those actions flow back into it,
 * the same way Atlas's host actions do (atlas/repos/hostBridge.ts).
 */

import { useEffect, useState } from "react";
import { emit, listen } from "@/platform/events";
import {
  TOOL_WINDOW_OPENED_EVENT,
  toolWindowParamsFromSearch,
  type ToolWindowOpened,
} from "./toolWindow";

const ROOT_EVENT = "nexis://workspace-root";
const ROOT_REQUEST_EVENT = "nexis://workspace-root-request";
const HOST_ACTION_EVENT = "nexis://tool-host-action";

export type ToolHostAction =
  | { kind: "file"; path: string }
  | { kind: "preview"; url: string }
  | { kind: "ssh"; command: string; label: string };

/** Tool-window side: have the main window do something it owns. */
export function requestToolHostAction(action: ToolHostAction): void {
  void emit(HOST_ACTION_EVENT, action).catch(() => {});
}

/** Main-window side. Returns an unlisten fn. */
export function onToolHostAction(handler: (action: ToolHostAction) => void) {
  return listen<ToolHostAction>(HOST_ACTION_EVENT, (event) => handler(event.payload));
}

/** Main-window side: publish the workspace root now, and whenever a tool
 * window that just started asks for it. */
export function useWorkspaceRootBroadcast(root: string | null): void {
  useEffect(() => {
    void emit(ROOT_EVENT, root).catch(() => {});
    const unlisten = listen(ROOT_REQUEST_EVENT, () => {
      void emit(ROOT_EVENT, root).catch(() => {});
    });
    return () => void unlisten.then((fn) => fn()).catch(() => {});
  }, [root]);
}

/**
 * Tool-window side: the main window's workspace root. Seeded from the launch
 * URL so the first frame is already right, then kept current.
 */
export function useToolWindowRoot(): string | null {
  const [root, setRoot] = useState<string | null>(
    () => toolWindowParamsFromSearch(window.location.search).root ?? null,
  );
  useEffect(() => {
    const unlisten = listen<string | null>(ROOT_EVENT, (event) => setRoot(event.payload ?? null));
    void emit(ROOT_REQUEST_EVENT).catch(() => {});
    return () => void unlisten.then((fn) => fn()).catch(() => {});
  }, []);
  return root;
}

/**
 * Tool-window side: the latest launch parameters for this tool, and a count
 * that goes up on every open — including a re-focus of the window that is
 * already up, which is how the entrance replays and how "Open the palette"
 * switches an open Studio to the palette.
 */
export function useToolWindowLaunch(toolId: string): {
  params: Record<string, string>;
  opens: number;
} {
  const [launch, setLaunch] = useState(() => ({
    params: toolWindowParamsFromSearch(window.location.search),
    opens: 0,
  }));
  useEffect(() => {
    const unlisten = listen<ToolWindowOpened>(TOOL_WINDOW_OPENED_EVENT, (event) => {
      if (event.payload.id !== toolId) return;
      setLaunch((prev) => ({ params: event.payload.params, opens: prev.opens + 1 }));
    });
    return () => void unlisten.then((fn) => fn()).catch(() => {});
  }, [toolId]);
  return launch;
}
