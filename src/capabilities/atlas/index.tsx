import { lazy } from "react";
import type { CapabilityDefinition } from "@/workbench/capability";
import { useCapabilityContext } from "@/workbench/CapabilityHost";
import { useAtlasStore } from "@/modules/atlas/repos/store";
import { AtlasWindowActions } from "@/modules/atlas/AtlasWindowActions";
import { requestAtlasHostAction } from "@/modules/atlas/repos/hostBridge";

const Panel = lazy(() => import("@/modules/atlas/AtlasPanel").then((module) => ({ default: module.AtlasPanel })));
function AtlasCapabilityPanel() {
  const context = useCapabilityContext();
  return <Panel openWorkspace={context.openWorkspace} openTerminal={context.terminal.open} openFile={context.editor.open} />;
}

export const atlasCapability: CapabilityDefinition = {
  id: "atlas.main",
  panels: [{ id: "atlas:main", legacyView: "atlas", title: "Atlas", location: "sidebar", icon: "globe", group: "Navigation", pack: "dev-tools", lifecycle: "unmount", render: () => <AtlasCapabilityPanel /> }],
  toolWindows: [{
    id: "atlas", label: "Atlas", title: "Atlas — Nexis", icon: "globe",
    width: 1440, height: 860, minWidth: 720, minHeight: 500, header: "featured",
    // The companion window has no tabs and no workspace of its own, so the
    // three actions that need them are forwarded to the main window instead
    // of falling through to the no-op host — which is what made "Open as
    // workspace" and "Terminal" dead buttons here. See hostBridge.ts.
    render: () => (
      <Panel
        standalone
        openWorkspace={(path) => requestAtlasHostAction({ kind: "workspace", path })}
        openTerminal={(path) => requestAtlasHostAction({ kind: "terminal", path })}
        openFile={(path) => requestAtlasHostAction({ kind: "file", path })}
      />
    ),
    renderActions: () => <AtlasWindowActions />,
  }],
  commands: (context) => [
    { id: "atlas.open", title: "Show Atlas (every git repo on this machine)", category: "View", pack: "dev-tools", keywords: ["repos", "repositories", "map", "isometric", "city", "dirty", "branch", "stash", "scan"], handler: () => context().panels.activate("atlas:main") },
    { id: "atlas.showRepo", title: "Show this repo in Atlas", category: "General", icon: "globe", keywords: ["atlas", "map", "repos", "isometric"], handler: () => {
      const host = context();
      const root = host.workspace.snapshot().roots[0];
      if (!root) { host.notify("No workspace open", "Open a folder before showing it in Atlas."); return; }
      host.panels.activate("atlas:main");
      void useAtlasStore.getState().showRepo(root);
    } },
    { id: "atlas.refresh", title: "Atlas: Refresh repositories", category: "Atlas", pack: "dev-tools", scope: { panelId: "atlas:main" }, keybindings: [{ key: "r" }], handler: () => useAtlasStore.getState().refresh() },
  ],
};
