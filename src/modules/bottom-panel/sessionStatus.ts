// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * How sessions tell the bottom panel what they are doing.
 *
 * The tab strip's dots are the reason a collapsed-small panel is still worth
 * having open: a red dot on Tests says more than a 40px sliver of log. Panels
 * report rather than having their state lifted out, because Build and Tests
 * keep their run in component state and there is no reason to move it —
 * they stay mounted in the panel, so the report stays current.
 */

import { useEffect } from "react";
import { useBottomPanelStore, type BottomTab, type SessionStatus } from "./store";

/** Report `status` for `tab` while mounted; idle again on unmount. */
export function useReportSessionStatus(tab: BottomTab, status: SessionStatus) {
  useEffect(() => {
    useBottomPanelStore.getState().reportStatus(tab, status);
  }, [tab, status]);
  useEffect(
    () => () => useBottomPanelStore.getState().reportStatus(tab, "idle"),
    [tab],
  );
}
