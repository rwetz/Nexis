import { lazy } from "react";
import { useIntegrationCapabilityHost } from "@/capabilities/integration-context";
import type { CapabilityDefinition } from "@/workbench/capability";

const SshPanel = lazy(() =>
  import("@/modules/ssh/SshPanel").then((module) => ({
    default: module.SshPanel,
  })),
);

function SshCapabilityPanel() {
  const host = useIntegrationCapabilityHost();
  return <SshPanel onConnect={host.openSshSession} />;
}

export const sshCapability: CapabilityDefinition = {
  id: "remote.ssh",
  panels: [{
    id: "remote:ssh",
    legacyView: "ssh",
    title: "SSH",
    location: "bottom",
    icon: "terminal",
    group: "Dev Tools",
    pack: "dev-tools",
    lifecycle: "unmount",
    showInRail: false,
    render: () => <SshCapabilityPanel />,
  }],
};
