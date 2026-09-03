// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Onboarding's open/closed state, as a store rather than as App state.
 *
 * The checklist used to be a sidebar view, which meant it read in a ~300px
 * column beside the very chrome it was describing. It is a full-window
 * takeover now, matching Settings and the shortcut reference — and a takeover
 * needs to be openable from places that are nowhere near App's render tree
 * (the welcome screen, the command palette, the tour's own footer), so the
 * trigger is a store like `useSettingsDialogStore` rather than a prop chain.
 */

import { create } from "zustand";

type State = {
  isOpen: boolean;
  show: () => void;
  hide: () => void;
};

export const useOnboardingDialogStore = create<State>((set) => ({
  isOpen: false,
  show: () => set({ isOpen: true }),
  hide: () => set({ isOpen: false }),
}));

/** Open the onboarding takeover. Safe to call from anywhere. */
export function openOnboarding(): void {
  useOnboardingDialogStore.getState().show();
}
