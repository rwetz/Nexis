import { useSettingsDialogStore } from "./settingsDialogStore";

export type SettingsTab =
  | "general"
  | "themes"
  | "shortcuts"
  | "models"
  | "agents"
  | "environment"
  | "formatters"
  | "about";

export async function openSettingsWindow(tab?: SettingsTab): Promise<void> {
  useSettingsDialogStore.getState().show(tab);
}
