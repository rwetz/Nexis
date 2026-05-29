import { create } from "zustand";
import type { LspDiagnostic } from "@/modules/lsp/protocol";

export type FileDiagnostics = {
  /** Absolute path (not URI). */
  path: string;
  diagnostics: LspDiagnostic[];
};

type DiagnosticsState = {
  byFile: Map<string, LspDiagnostic[]>;
  errorCount: number;
  warningCount: number;
};

type DiagnosticsActions = {
  setFileDiagnostics: (path: string, diags: LspDiagnostic[]) => void;
  clearFileDiagnostics: (path: string) => void;
  clearAll: () => void;
};

function recount(map: Map<string, LspDiagnostic[]>) {
  let errors = 0;
  let warnings = 0;
  for (const diags of map.values()) {
    for (const d of diags) {
      if (d.severity === 1) errors++;
      else if (d.severity === 2) warnings++;
    }
  }
  return { errorCount: errors, warningCount: warnings };
}

export const useDiagnosticsStore = create<DiagnosticsState & DiagnosticsActions>(
  (set, get) => ({
    byFile: new Map(),
    errorCount: 0,
    warningCount: 0,

    setFileDiagnostics(path, diags) {
      const next = new Map(get().byFile);
      if (diags.length === 0) {
        next.delete(path);
      } else {
        next.set(path, diags);
      }
      set({ byFile: next, ...recount(next) });
    },

    clearFileDiagnostics(path) {
      const next = new Map(get().byFile);
      next.delete(path);
      set({ byFile: next, ...recount(next) });
    },

    clearAll() {
      set({ byFile: new Map(), errorCount: 0, warningCount: 0 });
    },
  }),
);
