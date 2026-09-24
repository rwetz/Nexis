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
  pluginPanelCommands,
  resolvePluginView,
  sidebarPanels,
  visiblePluginPanels,
} from "./pluginPanels";
export type { PluginViewState } from "./pluginPanels";
export { RAIL_VIEWS, VIEW_CATALOG, viewPaletteCommands } from "./viewCatalog";
export type { ViewEntry, ViewKind } from "./viewCatalog";
