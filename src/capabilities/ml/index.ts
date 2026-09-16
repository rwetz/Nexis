import type { CapabilityDefinition } from "@/workbench/capability";

/** ML Lab UI remains a workbench tab while its native protocol is isolated. */
export const mlCapability: CapabilityDefinition = {
  id: "ml.engine",
  panels: [],
};
