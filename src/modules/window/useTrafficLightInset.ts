// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Whether a header has to leave the left 88pt clear for the macOS traffic
 * lights. In native fullscreen macOS hides them (they come back only in the
 * menu-bar reveal), so keeping the inset there leaves an empty strip at the
 * left of the header while the right side sits at its normal padding. Off
 * macOS there are no traffic lights at all.
 */

import { useEffect, useState } from "react";
import { IS_MAC } from "@/lib/platform";
import { desktopWindow } from "@/platform/desktop";

export function useTrafficLightInset(): boolean {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!IS_MAC) return;
    let live = true;
    let unlisten: (() => void) | undefined;
    const w = desktopWindow();
    const update = () => {
      void w
        .isFullscreen()
        .then((fs) => live && setFullscreen(fs))
        .catch(() => {});
    };
    update();
    // Entering and leaving fullscreen both resize the window.
    void w
      .onResized(update)
      .then((un) => {
        if (live) unlisten = un;
        else un();
      })
      .catch(() => {});
    return () => {
      live = false;
      unlisten?.();
    };
  }, []);

  return IS_MAC && !fullscreen;
}

/**
 * Double-clicking the empty part of a header leaves native fullscreen.
 *
 * Outside fullscreen a double-click on a drag region zooms the window (Tauri
 * does that); in fullscreen that does nothing, and the header is where
 * people reach to get out. Only a double-click on the drag region itself
 * counts, not on a button or tab inside it.
 */
export function leaveFullscreenOnDoubleClick(event: { target: EventTarget | null }): void {
  if (!IS_MAC) return;
  const el = event.target as HTMLElement | null;
  if (!el?.hasAttribute?.("data-tauri-drag-region")) return;
  const w = desktopWindow();
  void w
    .isFullscreen()
    .then((fs) => (fs ? w.setFullscreen(false) : undefined))
    .catch(() => {});
}
