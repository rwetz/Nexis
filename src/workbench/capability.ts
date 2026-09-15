import type { WorkspaceContext } from "@/platform/workspace";
import type { PlatformIpc } from "@/platform/ipc";
import type { CommandContribution, PanelContribution, PluginAPI } from "@/lib/plugins/types";

/** Callbacks are supplied by the workbench composition root; capabilities do
 * not reach into App, tab stores or a second workspace implementation. */
export interface CapabilityContext {
  workspace: WorkspaceContext;
  ipc: PlatformIpc;
  contributions: PluginAPI;
  panels: { activate(id: string): void };
  commands: { execute(id: string): Promise<boolean> };
  notify(message: string, detail?: string): void;
  terminal: { open(cwd: string): void; write(text: string): void };
  editor: { open(path: string): void };
  openWorkspace(path: string): void;
}

export type CapabilityDefinition = {
  id: string;
  panels: readonly PanelContribution[];
  commands?: (context: () => CapabilityContext) => readonly CommandContribution[];
};
