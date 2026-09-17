import { lazy } from "react";
import { useIntegrationCapabilityHost } from "@/capabilities/integration-context";
import { workspaceProjectKey } from "@/platform/workspaces";
import type { CapabilityDefinition } from "@/workbench/capability";

const Panel = lazy(() => import("@/modules/webdev/WebToolsPanel").then((module) => ({ default: module.WebToolsPanel })));
const HttpClientPanel = lazy(() =>
  import("@/modules/webdev/HttpClientPanel").then((module) => ({
    default: module.HttpClientPanel,
  })),
);

function HttpClientCapabilityPanel() {
  const host = useIntegrationCapabilityHost();
  return <HttpClientPanel workspaceKey={workspaceProjectKey(host.workspaceRoot)} />;
}

export const webToolsCapability: CapabilityDefinition = {
  id: "webdev.tools",
  panels: [
    { id: "webdev:tools", legacyView: "web-tools", title: "Web Tools", location: "sidebar", icon: "tools", group: "Dev Tools", pack: "web-dev", lifecycle: "unmount", render: () => <Panel /> },
    { id: "webdev:http-client", legacyView: "http-client", title: "HTTP Client", location: "sidebar", icon: "network", group: "Dev Tools", pack: "web-dev", lifecycle: "unmount", showInRail: false, render: () => <HttpClientCapabilityPanel /> },
  ],
  commands: (context) => [{
    id: "webdev.tools", title: "Show web tools (JSON, JWT, regex, codecs)", category: "View", pack: "web-dev",
    keywords: ["json", "jwt", "base64", "regex", "url encode", "format"],
    handler: () => context().panels.activate("webdev:tools"),
  }],
};
