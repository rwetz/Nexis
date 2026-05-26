import { create } from "zustand";
import type { SettingsTab } from "./openSettingsWindow";

type State = {
  isOpen: boolean;
  activeTab: SettingsTab;
  show: (tab?: SettingsTab) => void;
  hide: () => void;
};

export const useSettingsDialogStore = create<State>((set) => ({
  isOpen: false,
  activeTab: "general",
  show: (tab) => set({ isOpen: true, activeTab: tab ?? "general" }),
  hide: () => set({ isOpen: false }),
}));
