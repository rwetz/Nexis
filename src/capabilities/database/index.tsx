import { lazy } from "react";
import type { CapabilityDefinition } from "@/workbench/capability";

const DatabasePanel = lazy(() =>
  import("@/modules/database/DatabasePanel").then((module) => ({
    default: module.DatabasePanel,
  })),
);

export const databaseCapability: CapabilityDefinition = {
  id: "database.client",
  panels: [{
    id: "database:client",
    legacyView: "database",
    title: "Database",
    location: "sidebar",
    icon: "database",
    group: "Dev Tools",
    pack: "dev-tools",
    lifecycle: "unmount",
    showInRail: false,
    render: () => <DatabasePanel />,
  }],
};
