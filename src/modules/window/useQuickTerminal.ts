// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Wires the quick terminal into the running app: registers the global hotkey
 * from the main window, and gives the quick window itself its dismiss-on-blur
 * behaviour.
 *
 * Registration is deliberately confined to the main window. A global shortcut
 * is process-wide, so registering it from every window would either fail as a
 * duplicate or fire the handler N times per press.
 */

import { useEffect } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { hideQuickTerminal, toggleQuickTerminal } from "./quickTerminal";
import {
  isPlausibleAccelerator,
  QUICK_TERMINAL_LABEL,
} from "./quickTerminalConfig";

/** True when this webview is the quick-terminal drop-down. */
export function isQuickTerminalWindow(): boolean {
  try {
    return getCurrentWebviewWindow().label === QUICK_TERMINAL_LABEL;
  } catch {
    return false;
  }
}

/** True when the running webview owns global-shortcut registration. */
function isMainWindow(): boolean {
  try {
    return getCurrentWebviewWindow().label === "main";
  } catch {
    return false;
  }
}

/**
 * Register/unregister the global hotkey as the preference changes.
 *
 * Every failure path is swallowed to a console warning on purpose: the most
 * common one is "another app already owns this accelerator", which must not
 * take down app startup — the user sees an unresponsive hotkey and can pick a
 * different one in Settings.
 */
export function useQuickTerminalHotkey(): void {
  const enabled = usePreferencesStore((s) => s.quickTerminalEnabled);
  const hotkey = usePreferencesStore((s) => s.quickTerminalHotkey);
  const height = usePreferencesStore((s) => s.quickTerminalHeight);
  const hydrated = usePreferencesStore((s) => s.hydrated);

  useEffect(() => {
    if (!hydrated || !isMainWindow()) return;
    if (!enabled || !isPlausibleAccelerator(hotkey)) return;

    let cancelled = false;
    let registered = false;

    void (async () => {
      try {
        const { register, unregister, isRegistered } = await import(
          "@tauri-apps/plugin-global-shortcut"
        );
        // A stale registration can survive a hot reload; clear it first so the
        // register() below doesn't fail as a duplicate.
        if (await isRegistered(hotkey)) await unregister(hotkey);
        if (cancelled) return;
        await register(hotkey, (event) => {
          // The plugin fires for press *and* release; without this the window
          // toggles twice per keypress and appears not to open at all.
          if (event.state !== "Pressed") return;
          void toggleQuickTerminal(height).catch((e) =>
            console.error("[nexis] quick terminal toggle failed:", e),
          );
        });
        registered = true;
      } catch (e) {
        console.warn("[nexis] quick terminal hotkey registration failed:", e);
      }
    })();

    return () => {
      cancelled = true;
      if (!registered) return;
      void import("@tauri-apps/plugin-global-shortcut")
        .then(({ unregister }) => unregister(hotkey))
        .catch(() => {
          /* window is going away regardless */
        });
    };
  }, [hydrated, enabled, hotkey, height]);
}

/**
 * Dismiss-on-blur for the quick-terminal window itself. No-op in every other
 * window. Escape is handled here too so the drop-down can be dismissed without
 * reaching for the mouse — but only when the pref is on, so users who keep it
 * pinned don't lose Escape to the window (vim would be unusable).
 */
export function useQuickTerminalDismiss(): void {
  const hideOnBlur = usePreferencesStore((s) => s.quickTerminalHideOnBlur);

  useEffect(() => {
    if (!hideOnBlur || !isQuickTerminalWindow()) return;

    const win = getCurrentWebviewWindow();
    const unlistenPromise = win.onFocusChanged(({ payload: focused }) => {
      if (!focused)
        void hideQuickTerminal().catch(() => {
          /* already hidden or gone */
        });
    });

    return () => {
      void unlistenPromise.then((un) => un()).catch(() => {});
    };
  }, [hideOnBlur]);
}
