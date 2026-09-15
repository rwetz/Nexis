import { lazy } from "react";
import type { CapabilityDefinition } from "@/workbench/capability";

const Panel = lazy(() => import("@/modules/webdev/WebToolsPanel").then((module) => ({ default: module.WebToolsPanel })));

export const webToolsCapability: CapabilityDefinition = {
  id: "webdev.tools",
  panels: [{ id: "webdev:tools", legacyView: "web-tools", title: "Web Tools", location: "sidebar", icon: "tools", group: "Dev Tools", pack: "web-dev", lifecycle: "unmount", render: () => <Panel /> }],
  commands: (context) => [{
    id: "webdev.tools", title: "Show web tools (JSON, JWT, regex, codecs)", category: "View", pack: "web-dev",
    keywords: ["json", "jwt", "base64", "regex", "url encode", "format"],
    handler: () => context().panels.activate("webdev:tools"),
  }],
};
