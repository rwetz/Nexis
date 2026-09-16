import type { CapabilityDefinition } from "@/workbench/capability";

/** LAN sharing has module-level lifetime independent of its existing panel. */
export const shareCapability: CapabilityDefinition = {
  id: "share.http",
  panels: [],
};
