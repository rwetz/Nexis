// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { useDebugStore } from "@/modules/debugger/debugSession";
import { useEffect } from "react";
import { useBottomPanelStore } from "./store";

/**
 * Open the panel when you *start* something that lives in it from somewhere
 * else — a debug session launched from the editor. Only on the start
 * transition: a session that finishes, or a background process that exits,
 * must never pop the panel open under the cursor.
 *
 * Build and Tests need no rule here: they are started from their own tab, so
 * the panel is already open on them.
 */
export function useSessionAutoReveal() {
  useEffect(
    () =>
      useDebugStore.subscribe((state, prev) => {
        const debugging = state.status === "starting" || state.status === "running" || state.status === "stopped";
        useBottomPanelStore.getState().reportStatus("debugger", debugging ? "running" : "idle");
        if (state.status === "starting" && prev.status !== "starting") {
          useBottomPanelStore.getState().show("debugger");
        }
      }),
    [],
  );
}
