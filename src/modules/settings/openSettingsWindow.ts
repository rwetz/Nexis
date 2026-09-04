// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { useSettingsDialogStore } from "./settingsDialogStore";

export type SettingsTab =
  | "general"
  | "features"
  | "themes"
  | "privacy"
  | "shortcuts"
  | "models"
  | "agents"
  | "environment"
  | "formatters"
  | "about";

export async function openSettingsWindow(tab?: SettingsTab): Promise<void> {
  useSettingsDialogStore.getState().show(tab);
}
