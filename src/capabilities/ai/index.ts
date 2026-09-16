import type { CapabilityDefinition } from "@/workbench/capability";

export const aiCapability: CapabilityDefinition = {
  id: "ai.chat",
  panels: [],
  commands: (context) => [
    {
      id: "ai.toggle",
      title: "Toggle AI panel",
      category: "AI",
      keywords: ["chat", "agent", "assistant"],
      handler: () => context().overlays.toggle("ai"),
    },
  ],
};
