import React from "react";
import ReactDOM from "react-dom/client";

import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "./styles/globals.css";

import App from "./app/App";
import { USE_CUSTOM_WINDOW_CONTROLS, IS_TAURI } from "./lib/platform";

if (USE_CUSTOM_WINDOW_CONTROLS) {
  document.documentElement.dataset.chrome = "borderless";
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// The window starts hidden (tauri.conf.json) so users never see a transparent
// shadow-only frame before React paints. Show it once we've mounted.
if (IS_TAURI) {
  void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
    const show = () =>
      getCurrentWindow()
        .show()
        .catch((e) => console.error("window.show failed:", e));
    // rAF is throttled while hidden — use setTimeout, with a safety net.
    setTimeout(show, 50);
    setTimeout(show, 500);
  });
}
