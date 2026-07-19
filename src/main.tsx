// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "@fontsource/jetbrains-mono/cyrillic-400.css";
import "@fontsource/jetbrains-mono/cyrillic-700.css";
import "@xterm/xterm/css/xterm.css";
import "./styles/globals.css";

import { getCurrentWindow } from "@tauri-apps/api/window";
import { QUICK_TERMINAL_LABEL } from "@/modules/window/quickTerminalConfig";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { initLaunchDir } from "./lib/launchDir";
import { IS_LINUX, USE_CUSTOM_WINDOW_CONTROLS } from "./lib/platform";

if (USE_CUSTOM_WINDOW_CONTROLS) {
  document.documentElement.dataset.chrome = "borderless";
}

// WebKitGTK pays a steep per-frame cost for backdrop-filter; globals.css keys
// the Linux-only blur drop off this attribute. See the [data-os="linux"] rule.
if (IS_LINUX) {
  document.documentElement.dataset.os = "linux";
}

// Seed before first paint so default tab mounts at target cwd (no flicker).
await initLaunchDir();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />,
);

// Window starts hidden (per tauri.conf.json) so users never see a transparent
// shadow-only frame before React paints. Use setTimeout — rAF is throttled
// while the window is hidden and would never fire.
//
// The quick terminal is exempt: its visibility is owned entirely by the
// hotkey toggle, which shows it only after positioning it on the active
// monitor. Auto-showing here would both flash it at the default centred
// position and re-summon it uninvited if the webview ever reloads while
// hidden.
if (getCurrentWindow().label !== QUICK_TERMINAL_LABEL) {
  const showWindow = () => {
    getCurrentWindow()
      .show()
      .catch((e) => console.error("window.show failed:", e));
  };
  setTimeout(showWindow, 50);
  // Safety net: if the first show somehow fails to take effect, force again.
  setTimeout(showWindow, 500);
}
