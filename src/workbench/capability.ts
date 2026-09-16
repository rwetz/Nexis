import type { WorkspaceContext } from "@/platform/workspace";
import type { PlatformIpc } from "@/platform/ipc";
import type { CommandContribution, PanelContribution, PluginAPI } from "@/lib/plugins/types";
import type { IconName } from "@/components/icon";
import type { ReactNode } from "react";

/** Callbacks are supplied by the workbench composition root; capabilities do
 * not reach into App, tab stores or a second workspace implementation. */
export interface CapabilityContext {
  workspace: WorkspaceContext;
  ipc: PlatformIpc;
  contributions: PluginAPI;
  panels: { activate(id: string): void };
  overlays: { toggle(id: string): void };
  commands: { execute(id: string): Promise<boolean> };
  notify(message: string, detail?: string): void;
  terminal: {
    open(cwd: string): void;
    write(text: string): void;
    requestAiCommand(): void;
  };
  editor: { open(path: string): void };
  openWorkspace(path: string): void;
}

export type CapabilityDefinition = {
  id: string;
  panels: readonly PanelContribution[];
  commands?: (context: () => CapabilityContext) => readonly CommandContribution[];
  toolWindows?: readonly ToolWindowContribution[];
};

/** Focused companion surfaces are declared by their capability instead of
 * being hard-coded into the application shell. They intentionally receive no
 * workspace context: Atlas and Benchmark companion windows are host-scoped. */
export type ToolWindowContribution = {
  id: string;
  label: string;
  title: string;
  icon: IconName;
  width: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  header?: "compact" | "featured";
  render: () => ReactNode;
  renderActions?: () => ReactNode;
};
