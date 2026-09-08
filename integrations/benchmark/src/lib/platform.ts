import { platform } from "@tauri-apps/plugin-os";

const PLATFORM = (() => {
  try {
    return platform();
  } catch {
    return ""; // "" when not running inside Tauri (e.g. a plain browser/test)
  }
})();

export const IS_MAC = PLATFORM === "macos";
export const IS_LINUX = PLATFORM === "linux";
export const IS_WINDOWS = PLATFORM === "windows";

/** True when we render our own min/max/close controls (Windows/Linux).
 *  macOS keeps native traffic lights via the overlay title bar. */
export const USE_CUSTOM_WINDOW_CONTROLS = !IS_MAC && PLATFORM !== "";

/** True when running inside a Tauri webview (vs. a plain browser). */
export const IS_TAURI = PLATFORM !== "";
