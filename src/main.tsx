// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Cascadia Code is the default code face (see src/lib/fonts.ts).
//
// The VARIABLE build, not the static weights, because Settings offers five
// terminal font weights (300/400/500/600/700) and static 400+700 would leave
// Light, Medium and Semibold to be synthesized by the rasterizer — which on a
// monospace grid is exactly where faux weights look worst. One axis file per
// style covers all five for ~12 KB more than three static files.
//
// These sheets declare every subset, but each @font-face carries a
// unicode-range, so a file is only fetched when something on screen needs it.
// That matters here beyond latin: Cascadia covers U+2800 braille, which is
// what the system-monitor sparklines (modules/sysmon/braille.ts) draw with.
// Space Grotesk is the display face, wired to --font-heading. It is
// deliberately NOT the body face: its wide mechanical counters close up
// below ~13px, and Nexis sets over a thousand call sites under 12px. It
// earns its place only at the handful of moments the app introduces itself.
import "@fontsource-variable/space-grotesk/wght.css";
import "@fontsource-variable/cascadia-code/wght.css";
import "@fontsource-variable/cascadia-code/wght-italic.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "@fontsource/jetbrains-mono/cyrillic-400.css";
import "@fontsource/jetbrains-mono/cyrillic-700.css";
import "@xterm/xterm/css/xterm.css";
import "./styles/globals.css";

import { desktopWindow } from "@/platform/desktop";
import { QUICK_TERMINAL_LABEL } from "@/modules/window/quickTerminalConfig";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { initLaunchDir } from "./lib/launchDir";
import { IS_LINUX, USE_CUSTOM_WINDOW_CONTROLS } from "./lib/platform";
import { useWorkspaceEnvStore } from "./platform/workspaces";
import { setLastWslDistro } from "./modules/settings/store";

// Remember the user's selection at the composition root. Workspace policy
// does not depend on the application's preference schema.
useWorkspaceEnvStore.subscribe((state, previous) => {
  if (state.env !== previous.env && state.env.kind === "wsl") {
    void setLastWslDistro(state.env.distro);
  }
});

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

if (import.meta.env.MODE === "e2e") {
  await import("./test/desktop-api");
}

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
if (desktopWindow().label !== QUICK_TERMINAL_LABEL) {
  const showWindow = () => {
    desktopWindow()
      .show()
      .catch((e) => console.error("window.show failed:", e));
  };
  setTimeout(showWindow, 50);
  // Safety net: if the first show somehow fails to take effect, force again.
  setTimeout(showWindow, 500);
}
