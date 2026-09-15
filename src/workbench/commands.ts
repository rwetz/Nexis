import { usePluginRegistry } from "@/lib/plugins/registry";
import { packEnabled } from "@/lib/packs";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { matchBinding } from "@/modules/shortcuts/shortcuts";
import { commandEnabled, type ActivationContext } from "./contributions";
import type { CommandContribution } from "@/lib/plugins/types";

export function canExecute(command: CommandContribution, context: ActivationContext): boolean {
  return packEnabled(command.pack, usePreferencesStore.getState().enabledPacks) && commandEnabled(command, context);
}

export async function executeCommand(id: string, context: ActivationContext): Promise<boolean> {
  const command = usePluginRegistry.getState().commands.get(id);
  if (!command || !canExecute(command, context)) return false;
  await command.handler();
  return true;
}

/** Called by the existing global shortcut router, after built-in bindings. */
export function dispatchContributedShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.repeat || event.isComposing) return false;
  const target = event.target instanceof Element ? event.target : null;
  const context: ActivationContext = {
    activePanelId: target?.closest<HTMLElement>("[data-panel-id]")?.dataset.panelId ?? null,
    inputFocused: !!target?.closest("input, textarea, select, [contenteditable=true], .cm-editor, .xterm"),
  };
  for (const command of usePluginRegistry.getState().commands.values()) {
    if (!canExecute(command, context) || !command.keybindings?.some((binding) => matchBinding(event, binding))) continue;
    event.preventDefault();
    event.stopImmediatePropagation();
    void executeCommand(command.id, context).catch((error) => console.error(`[commands] ${command.id} failed`, error));
    return true;
  }
  return false;
}
