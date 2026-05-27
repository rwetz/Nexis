import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { IS_MAC } from "@/lib/platform";

/** Open a fresh Nexis window with no tab state restored. */
export async function openNewWindow(): Promise<void> {
  const label = `nexis-${Date.now()}`;

  // Match the platform-specific chrome used by the main window.
  // Mac: overlay title bar with hidden title (native traffic lights).
  // Windows/Linux: fully custom controls — decorations off, transparent background.
  const platformOptions = IS_MAC
    ? { titleBarStyle: "overlay" as const, hiddenTitle: true }
    : { decorations: false, transparent: true, shadow: false };

  const win = new WebviewWindow(label, {
    url: "/?fresh=1",
    title: "Nexis",
    width: 1200,
    height: 800,
    minWidth: 420,
    minHeight: 280,
    ...platformOptions,
  });

  win.once("tauri://error", (e) => {
    console.error("[nexis] Failed to open new window:", e);
  });
}
