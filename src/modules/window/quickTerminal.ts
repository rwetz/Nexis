// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Quick terminal — a drop-down terminal summoned from any app with a global
 * hotkey and dismissed on blur (iTerm2's Hotkey Window, Ghostty's Quick
 * Terminal).
 *
 * It is a normal Nexis window loading `/?quick=1`, which the app renders in
 * zen mode. No new PTY or session machinery: it reuses the same terminal stack
 * as every other window. The window is kept alive once created and toggled
 * with show/hide, because destroying the webview would kill the shell and make
 * every summon cost a cold start.
 *
 * Pure geometry/accelerator logic lives in `./quickTerminalConfig` so the
 * preferences store can share it without importing the window API.
 */

import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { currentMonitor } from "@tauri-apps/api/window";
import { IS_MAC } from "@/lib/platform";
import {
  QUICK_TERMINAL_LABEL,
  quickTerminalGeometry,
} from "./quickTerminalConfig";

/** Reposition onto whichever monitor is currently active. */
async function positionOnActiveMonitor(
  win: WebviewWindow,
  heightFraction: number,
): Promise<void> {
  const monitor = await currentMonitor();
  if (!monitor) return;
  const geo = quickTerminalGeometry(monitor, heightFraction);
  await win.setSize(new LogicalSize(geo.width, geo.height));
  await win.setPosition(new LogicalPosition(geo.x, geo.y));
}

async function createQuickTerminal(
  heightFraction: number,
): Promise<WebviewWindow> {
  const win = new WebviewWindow(QUICK_TERMINAL_LABEL, {
    url: "/?quick=1",
    title: "Nexis Quick Terminal",
    width: 1200,
    height: 400,
    decorations: false,
    transparent: !IS_MAC,
    shadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focus: true,
    // Created hidden and shown only after it has been positioned, so the
    // window never flashes at the default centred position first.
    visible: false,
  });

  await new Promise<void>((resolve, reject) => {
    win.once("tauri://created", () => resolve());
    win.once("tauri://error", (e) => reject(new Error(String(e.payload))));
  });

  await positionOnActiveMonitor(win, heightFraction);
  await win.show();
  await win.setFocus();
  return win;
}

/**
 * Show the quick terminal if it is hidden, hide it if it is already showing.
 * Safe to call from the global-shortcut handler on every press.
 */
export async function toggleQuickTerminal(
  heightFraction: number,
): Promise<void> {
  const existing = await WebviewWindow.getByLabel(QUICK_TERMINAL_LABEL);
  if (!existing) {
    await createQuickTerminal(heightFraction);
    return;
  }
  if (await existing.isVisible()) {
    await existing.hide();
    return;
  }
  // Re-position on every show: the user may have moved to a different monitor
  // since the last summon, and a drop-down that appears on yesterday's screen
  // is worse than no drop-down.
  await positionOnActiveMonitor(existing, heightFraction);
  await existing.show();
  await existing.setFocus();
}

/** Hide (never destroy) the quick terminal — used by the blur and Escape paths. */
export async function hideQuickTerminal(): Promise<void> {
  const win = await WebviewWindow.getByLabel(QUICK_TERMINAL_LABEL);
  if (win && (await win.isVisible())) await win.hide();
}
