// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

export { PackGatePlaceholder } from "./PackGatePlaceholder";
export { PluginPanelSlot } from "./PluginPanelSlot";
export { SidebarRail, SIDEBAR_RAIL_HEIGHT } from "./SidebarRail";
export {
  SIDEBAR_VIEW_IDS,
  isPluginPanelViewId,
  isSidebarView,
  isSidebarViewId,
  panelIdFromView,
  pluginPanelViewId,
} from "./types";
export type { PluginPanelViewId, SidebarView, SidebarViewId } from "./types";
export {
  findPluginPanel,
  resolvePluginView,
  sidebarPanels,
  visiblePluginPanels,
} from "./pluginPanels";
export type { PluginViewState } from "./pluginPanels";
