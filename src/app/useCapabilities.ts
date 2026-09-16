import { useMemo } from "react";
import { toast } from "sonner";
import { notify } from "@/platform/notifications";
import type { CommandDef } from "@/components/CommandPalette";
import { createPluginAPI, usePluginRegistry } from "@/lib/plugins/registry";
import { packEnabled, type PackId } from "@/lib/packs";
import { findPluginPanel } from "@/modules/sidebar/pluginPanels";
import { pluginPanelViewId, type SidebarView } from "@/modules/sidebar/types";
import { workspaceWithRoots } from "@/platform/workspaces";
import { createPlatformIpc } from "@/platform/ipc";
import { tauriTransport } from "@/platform/tauri";
import type { CapabilityContext } from "@/workbench/capability";
import { canExecute, executeCommand } from "@/workbench/commands";

/** Composition wiring. Tabs/splits stay owned by useTabs/App; capabilities
 * receive operations, never access to the tab store or terminal renderer. */
export function useCapabilities(options: {
  view: SidebarView;
  root: string | null;
  packs: readonly PackId[];
  builtins: CommandDef[];
  activateView(view: SidebarView): void;
  toggleOverlay(id: string): void;
  terminal: CapabilityContext["terminal"];
  editor: CapabilityContext["editor"];
  openWorkspace(path: string): void;
}) {
  const commands = usePluginRegistry((state) => state.commands);
  const panels = usePluginRegistry((state) => state.panels);
  const selectedPanelId = findPluginPanel(options.view, panels)?.id ?? null;
  const { builtins, packs } = options;
  const paletteCommands = useMemo(() => {
    const activation = { activePanelId: selectedPanelId, inputFocused: false };
    return [
      ...builtins.filter((command) => packEnabled(command.pack, packs)),
      ...[...commands.values()].filter((command) => canExecute(command, activation)).map((command): CommandDef => ({
        id: command.id, label: command.title, category: command.category ?? "Extensions",
        icon: command.icon, keywords: command.keywords, pack: command.pack,
        action: () => { void executeCommand(command.id, activation).catch((error) => toast.error(String(error))); },
      })),
    ];
  }, [builtins, packs, commands, selectedPanelId]);
  const workspace = workspaceWithRoots(() => options.root ? [options.root] : []);
  const context: CapabilityContext = {
    workspace,
    ipc: createPlatformIpc(tauriTransport, workspace),
    contributions: createPluginAPI(),
    panels: { activate: (id) => {
      const panel = usePluginRegistry.getState().panels.find((item) => item.id === id);
      if (!panel || !packEnabled(panel.pack, options.packs)) return;
      options.activateView(panel.legacyView ?? pluginPanelViewId(id));
    } },
    overlays: { toggle: options.toggleOverlay },
    commands: { execute: (id) => executeCommand(id, { activePanelId: selectedPanelId, inputFocused: false }) },
    notify: (message, detail) => notify({ message, detail, kind: "error" }),
    terminal: options.terminal,
    editor: options.editor,
    openWorkspace: options.openWorkspace,
  };
  return { context, paletteCommands };
}
