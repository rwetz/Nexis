// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

export { BottomPanel } from "./BottomPanel";
export { PanelDock } from "./PanelDock";
export { useSessionAutoReveal } from "./autoReveal";
export { useReportSessionStatus } from "./sessionStatus";
export {
  BOTTOM_PANEL_MIN_HEIGHT,
  PROBLEMS_TAB,
  useBottomPanelStore,
} from "./store";
export type { BottomTab, SessionStatus } from "./store";
export { bottomTabs, isBottomView, SESSION_VIEWS } from "./tabs";
