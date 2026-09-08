// Entry point — Nexis design system bootstrap.
// JetBrains Mono is loaded for mono text (paths, branch names).
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "./styles/globals.css";

import { getCurrentWindow } from "@tauri-apps/api/window";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { USE_CUSTOM_WINDOW_CONTROLS } from "@nexis/design";

// Non-macOS: we paint our own rounded, borderless frame (see globals.css
// html[data-chrome="borderless"]). macOS keeps native traffic lights.
if (USE_CUSTOM_WINDOW_CONTROLS) {
  document.documentElement.dataset.chrome = "borderless";
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />,
);

// The window is created hidden (tauri.conf.json `visible: false`) so users never
// see a transparent shadow-only frame before React's first paint. Show it once
// React has mounted. setTimeout (not rAF — rAF is throttled while hidden).
const showWindow = () => {
  getCurrentWindow()
    .show()
    .catch((e) => console.error("window.show failed:", e));
};
setTimeout(showWindow, 50);
// Safety net: if the first show somehow fails to take effect, force again.
setTimeout(showWindow, 500);
