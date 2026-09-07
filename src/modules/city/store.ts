import { toast } from "sonner";
import { create } from "zustand";
import { fetchRepoCity, scanRepos } from "./api";
import type { Block } from "./layout";
import type { RepoCity, RepoSummary } from "./types";

export type View = "atlas" | "city";

type CityState = {
  // ── atlas ────────────────────────────────────────────────────────────────
  repos: RepoSummary[];
  scanning: boolean;
  /** null until the first scan lands */
  elapsedMs: number | null;
  configPath: string | null;
  scanRoot: string | null;
  scanError: string | null;

  // ── drill-in ─────────────────────────────────────────────────────────────
  view: View;
  activeRepo: string | null;
  city: RepoCity | null;
  cityLoading: boolean;
  cityError: string | null;

  // ── interaction ──────────────────────────────────────────────────────────
  hover: Block | null;
  selected: Block | null;
  showLabels: boolean;
  /** Blocks the layout had to drop — reported by the canvas once it has built
   *  the scene, so the UI can admit the view is incomplete instead of quietly
   *  rendering a partial city. */
  omitted: number;
  /** Bumped to ask the canvas to re-fit the camera to the scene. */
  fitNonce: number;

  refresh: () => Promise<void>;
  enterRepo: (path: string) => Promise<void>;
  backToAtlas: () => void;
  setHover: (block: Block | null) => void;
  setSelected: (block: Block | null) => void;
  setOmitted: (count: number) => void;
  toggleLabels: () => void;
  requestFit: () => void;
};

export const useCityStore = create<CityState>((set, get) => ({
  repos: [],
  scanning: false,
  elapsedMs: null,
  configPath: null,
  scanRoot: null,
  scanError: null,

  view: "atlas",
  activeRepo: null,
  city: null,
  cityLoading: false,
  cityError: null,

  hover: null,
  selected: null,
  showLabels: true,
  omitted: 0,
  fitNonce: 0,

  refresh: async () => {
    if (get().scanning) return;
    set({ scanning: true });
    try {
      const result = await scanRepos();
      set({
        repos: result.repos,
        elapsedMs: result.elapsed_ms,
        configPath: result.config_path,
        scanRoot: result.scan_root,
        scanError: null,
        hover: null,
        selected: null,
      });
      // A repo that vanished between scans cannot stay on screen.
      const { activeRepo } = get();
      if (activeRepo) {
        if (result.repos.some((r) => r.path === activeRepo)) {
          await get().enterRepo(activeRepo);
        } else {
          get().backToAtlas();
        }
      }
    } catch (e) {
      const message = String(e);
      set({ scanError: message });
      toast.error("Scan failed", { description: message });
    } finally {
      set({ scanning: false });
    }
  },

  enterRepo: async (path) => {
    set({
      view: "city",
      activeRepo: path,
      cityLoading: true,
      cityError: null,
      hover: null,
      selected: null,
    });
    try {
      const city = await fetchRepoCity(path);
      // The user may have navigated on while the walk was running.
      if (get().activeRepo !== path) return;
      set({ city, cityLoading: false, fitNonce: get().fitNonce + 1 });
    } catch (e) {
      const message = String(e);
      if (get().activeRepo !== path) return;
      set({ cityError: message, cityLoading: false, city: null });
      toast.error("Could not read repo", { description: message });
    }
  },

  backToAtlas: () =>
    set((s) => ({
      view: "atlas",
      activeRepo: null,
      city: null,
      cityError: null,
      hover: null,
      selected: null,
      fitNonce: s.fitNonce + 1,
    })),

  setHover: (block) => {
    if (get().hover?.id === block?.id) return;
    set({ hover: block });
  },

  setSelected: (block) => set({ selected: block }),

  setOmitted: (count) => {
    if (get().omitted === count) return;
    set({ omitted: count });
  },

  toggleLabels: () => set((s) => ({ showLabels: !s.showLabels })),

  requestFit: () => set((s) => ({ fitNonce: s.fitNonce + 1 })),
}));
