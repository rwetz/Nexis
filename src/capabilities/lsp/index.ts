import type { CapabilityDefinition } from "@/workbench/capability";

/** LSP contributes editor behavior rather than a standalone workbench panel. */
export const lspCapability: CapabilityDefinition = {
  id: "editor.lsp",
  panels: [],
};
