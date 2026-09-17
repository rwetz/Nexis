import { lazy } from "react";
import { useIntegrationCapabilityHost } from "@/capabilities/integration-context";
import type { CapabilityDefinition } from "@/workbench/capability";

const PortsPanel = lazy(() =>
  import("@/modules/ports/PortsPanel").then((module) => ({
    default: module.PortsPanel,
  })),
);

function PortsCapabilityPanel() {
  const host = useIntegrationCapabilityHost();
  return <PortsPanel onOpenPreview={host.openPreview} />;
}

export const portsCapability: CapabilityDefinition = {
  id: "network.ports",
  panels: [{
    id: "network:ports",
    legacyView: "ports",
    title: "Ports",
    location: "sidebar",
    icon: "network",
    group: "Dev Tools",
    pack: "dev-tools",
    lifecycle: "unmount",
    showInRail: false,
    render: () => <PortsCapabilityPanel />,
  }],
};
