// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { create } from "zustand";

/**
 * Per-file syntax-language overrides for the editor (session-only, keyed by
 * absolute path). Set from the language dropdown in the pane header; read by
 * EditorPane when (re)configuring the CodeMirror language compartment.
 */
type State = {
  overrides: Record<string, string>;
  setOverride: (path: string, id: string | null) => void;
};

export const useLanguageOverrides = create<State>((set) => ({
  overrides: {},
  setOverride: (path, id) =>
    set((s) => {
      const next = { ...s.overrides };
      if (id === null) delete next[path];
      else next[path] = id;
      return { overrides: next };
    }),
}));
