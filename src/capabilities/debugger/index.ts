import type { CapabilityDefinition } from "@/workbench/capability";

/** Debugger UI remains an existing panel while DAP protocol ownership migrates. */
export const debuggerCapability: CapabilityDefinition = {
  id: "debugger.dap",
  panels: [],
};
