import { lazy } from "react";
import type { CapabilityDefinition } from "@/workbench/capability";
import { useGitCapabilityHost } from "./context";

const Panel = lazy(() =>
  import("@/modules/source-control/SourceControlPanel").then((module) => ({
    default: module.SourceControlPanel,
  })),
);

function GitCapabilityPanel() {
  const host = useGitCapabilityHost();
  return <Panel open {...host} />;
}

export const gitCapability: CapabilityDefinition = {
  id: "git.source-control",
  panels: [{
    id: "git:source-control",
    legacyView: "source-control",
    title: "Source Control",
    location: "sidebar",
    icon: "folder-git",
    group: "Code",
    lifecycle: "unmount",
    showInRail: false,
    render: () => <GitCapabilityPanel />,
  }],
  commands: (context) => [{
    id: "git.source-control.open",
    title: "Show source control",
    category: "View",
    keywords: ["git", "changes", "stage", "commit"],
    handler: () => context().panels.activate("git:source-control"),
  }],
};
