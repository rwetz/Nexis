import { lazy } from "react";
import type { CapabilityDefinition } from "@/workbench/capability";

const SharePanel = lazy(() =>
  import("@/modules/share/SharePanel").then((module) => ({
    default: module.SharePanel,
  })),
);

/** The server lifetime remains module-owned and outlives this panel mount. */
export const shareCapability: CapabilityDefinition = {
  id: "share.http",
  panels: [{
    id: "share:terminal",
    legacyView: "share",
    title: "Share",
    location: "sidebar",
    icon: "globe",
    group: "Advanced",
    pack: "advanced",
    lifecycle: "unmount",
    showInRail: false,
    render: () => <SharePanel />,
  }],
};
