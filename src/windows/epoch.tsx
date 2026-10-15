// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The Epoch window: Nexis Epoch's own UI, built from its source
 * (`@nexis-epoch/desktop`, pinned by commit) into a page of its own
 * (epoch.html), over the same `tauri-plugin-epoch` backend the standalone
 * app registers. A feature added to Epoch reaches this window with the next
 * pin bump; nothing here re-implements one.
 *
 * It is a separate page, not a ToolWindowShell tool, because Epoch brings its
 * own design layer (@nexis/design) and stylesheet; on a page of its own
 * neither touches Nexis's. Only the host differs from the standalone app:
 * links come from the launch parameters and the tool-window-opened event
 * instead of a loopback socket, and Synapse and Pulse are opened in place.
 */

import { mountEpoch, type EpochHost } from "@nexis-epoch/desktop/embed";
import { linkFromParams } from "./epochLinks";
import { desktopWindow } from "@/platform/desktop";
import { listen } from "@/platform/events";
import { TOOL_WINDOW_OPENED_EVENT, type ToolWindowOpened } from "@/modules/window/toolWindow";
import { requestToolHostAction } from "@/modules/window/toolWindowHost";

const nexisHost: EpochHost = {
  kind: "nexis",
  async openInNexis(args) {
    const params: Record<string, string> = {};
    if (args.project) params.project = args.project;
    if (args.run) params.run = args.run;
    if (args.model) params.model = args.model;
    requestToolHostAction({ kind: "tool", tool: args.tool, params });
    return "opened";
  },
  subscribeLinks(follow) {
    const initial = linkFromParams(Object.fromEntries(new URLSearchParams(window.location.search)), true);
    if (initial) follow(initial);
    let mountedAt = performance.now();
    const unlisten = listen<ToolWindowOpened>(TOOL_WINDOW_OPENED_EVENT, (event) => {
      if (event.payload.id !== "epoch") return;
      // The open that created this window arrives as an event too, moments
      // after mount; its parameters were already read from the URL.
      if (performance.now() - mountedAt < 900) {
        mountedAt = -Infinity;
        return;
      }
      const link = linkFromParams(event.payload.params, false);
      if (link) follow(link);
    });
    return () => void unlisten.then((fn) => fn()).catch(() => {});
  },
};

mountEpoch(document.getElementById("root")!, nexisHost);

// Shown once React has painted, like the standalone app.
const show = () => void desktopWindow().show().catch(() => {});
setTimeout(show, 50);
setTimeout(show, 500);
