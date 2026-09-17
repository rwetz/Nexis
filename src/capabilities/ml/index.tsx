import { lazy } from "react";
import { useIntegrationCapabilityHost } from "@/capabilities/integration-context";
import type { CapabilityDefinition } from "@/workbench/capability";

const MlPanel = lazy(() =>
  import("@/modules/ml/MlPanel").then((module) => ({
    default: module.MlPanel,
  })),
);

function MlCapabilityPanel() {
  const host = useIntegrationCapabilityHost();
  return (
    <MlPanel
      workspaceRoot={host.workspaceRoot}
      onOpenNetworkTab={host.openMlNetwork}
    />
  );
}

export const mlCapability: CapabilityDefinition = {
  id: "ml.engine",
  panels: [{
    id: "ml:lab",
    legacyView: "ml",
    title: "ML Lab",
    location: "sidebar",
    icon: "brain",
    group: "Dev Tools",
    pack: "ml-lab",
    lifecycle: "unmount",
    showInRail: false,
    render: () => <MlCapabilityPanel />,
  }],
};
