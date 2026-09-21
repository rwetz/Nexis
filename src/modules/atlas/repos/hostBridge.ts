// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Atlas's host actions, forwarded from the companion window to the main one.
 *
 * `ToolWindowShell` is a separate Tauri window: its own React root, its own
 * `ThemeProvider`, and deliberately no `CapabilityHost` — there are no tabs
 * or workspace in it to host anything. So the companion window passed no
 * `AtlasHost`, every callback fell through to the no-op default, and "Open as
 * workspace", "Terminal" and opening a file were dead buttons. ("Show on map"
 * and "Folder" kept working because one is store-local and the other goes
 * straight to the OS.)
 *
 * Rather than give the companion window a tab system it has no business
 * owning, the three actions that need one are emitted to the main window,
 * which already has all of them wired. The main window then raises itself,
 * because an action whose whole effect lands in a window you cannot see is
 * the same failure in a different costume.
 */

import { emit, listen, type UnlistenFn } from "@/platform/events";

const EVENT = "nexis://atlas-host-action";

export type AtlasHostAction = {
  kind: "workspace" | "terminal" | "file";
  path: string;
};

/** Ask the main window to perform one of Atlas's host actions. */
export function requestAtlasHostAction(action: AtlasHostAction): void {
  void emit(EVENT, action).catch(() => {
    // Nothing useful to do here: the companion window cannot perform the
    // action itself, and a toast about IPC would not help the user act.
  });
}

/** Main-window side. Returns an unlisten fn. */
export function onAtlasHostAction(
  handler: (action: AtlasHostAction) => void,
): Promise<UnlistenFn> {
  return listen<AtlasHostAction>(EVENT, (event) => handler(event.payload));
}
