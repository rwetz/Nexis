import { FileExplorer } from "@/modules/explorer";
import type { CapabilityDefinition } from "@/workbench/capability";
import { useExplorerCapabilityHost } from "./context";

function ExplorerCapabilityPanel() {
  const { explorerRef, ...props } = useExplorerCapabilityHost();
  return <FileExplorer ref={explorerRef} {...props} />;
}

export const editorCapability: CapabilityDefinition = {
  id: "editor.explorer",
  panels: [{
    id: "editor:explorer",
    legacyView: "explorer",
    title: "Files",
    location: "sidebar",
    icon: "explorer",
    group: "Navigation",
    lifecycle: "unmount",
    showInRail: false,
    render: () => <ExplorerCapabilityPanel />,
  }],
  commands: (context) => [{
    id: "editor.explorer.open",
    title: "Show file explorer",
    category: "View",
    keywords: ["files", "folders", "project"],
    handler: () => context().panels.activate("editor:explorer"),
  }],
};
