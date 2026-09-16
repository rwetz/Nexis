import type { CapabilityDefinition } from "@/workbench/capability";

export const terminalCapability: CapabilityDefinition = {
  id: "terminal.shell",
  panels: [],
  commands: (context) => [
    {
      id: "terminal.aiCommand",
      title: "AI command search",
      category: "AI",
      keywords: ["natural language", "generate command"],
      handler: () => context().terminal.requestAiCommand(),
    },
  ],
};
