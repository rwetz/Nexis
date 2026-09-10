import { toast } from "sonner";
import { create } from "zustand";
import { fetchRepoCity, fetchRepoDetail, scanRepos } from "./api";
import { displayOrder, type RepoCity, type RepoDetail, type RepoSummary } from "./types";
// Type-only: the store holds the canvas's current block but never imports the
// renderer. `layout` depends on `./types`, not on this file, so there is no cycle.
import type { Block } from "@/modules/atlas/map/layout";

/** Which view is on screen. Both read the same scan. */
export type Mode = "list" | "map";

/** Where the map is: the whole atlas, or inside one repo. */
export type MapView = "atlas" | "city";

type AtlasState = {
  // ── the one scan, shared by both views ───────────────────────────────────
  repos: RepoSummary[];
  scanning: boolean;
  /** null until the first scan lands */
  elapsedMs: number | null;
  configPath: string | null;
  scanRoot: string | null;
  scanError: string | null;

  // ── which view, and what is selected in it ───────────────────────────────
  mode: Mode;
  /** The selected repo, shared across both views: pick one in the list, switch
   *  to the map, and it is still the one highlighted. This is the whole reason
   *  the two apps are one app. */
  selectedPath: string | null;

  // ── list view ────────────────────────────────────────────────────────────
  detailOpen: boolean;
  detail: RepoDetail | null;
  detailLoading: boolean;

  // ── map view ─────────────────────────────────────────────────────────────
  mapView: MapView;
  activeRepo: string | null;
  city: RepoCity | null;
  cityLoading: boolean;
  cityError: string | null;
  hover: Block | null;
  selectedBlock: Block | null;
  showLabels: boolean;
  /** Blocks the layout had to drop — reported by the canvas once it has built
   *  the scene, so the UI can admit the view is incomplete instead of quietly
   *  rendering a partial city. */
  omitted: number;
  /** Bumped to ask the canvas to re-fit the camera to the scene. */
  fitNonce: number;

  refresh: () => Promise<void>;
  /** Open one of the repositories already admitted by Atlas's scan. */
  showRepo: (path: string) => Promise<void>;

  setMode: (mode: Mode) => void;
  toggleMode: () => void;
  select: (path: string) => void;
  moveSelection: (delta: number) => void;
  /** The repo both views agree is current, or null. */
  selectedRepo: () => RepoSummary | null;

  openDetail: () => Promise<void>;
  closeDetail: () => void;
  toggleDetail: () => Promise<void>;

  enterRepo: (path: string) => Promise<void>;
  backToAtlas: () => void;
  setHover: (block: Block | null) => void;
  setSelectedBlock: (block: Block | null) => void;
  setOmitted: (count: number) => void;
  toggleLabels: () => void;
  requestFit: () => void;
};

export const useAtlasStore = create<AtlasState>((set, get) => ({
  repos: [],
  scanning: false,
  elapsedMs: null,
  configPath: null,
  scanRoot: null,
  scanError: null,

  mode: "list",
  selectedPath: null,

  detailOpen: false,
  detail: null,
  detailLoading: false,

  mapView: "atlas",
  activeRepo: null,
  city: null,
  cityLoading: false,
  cityError: null,
  hover: null,
  selectedBlock: null,
  showLabels: true,
  omitted: 0,
  fitNonce: 0,

  refresh: async () => {
    if (get().scanning) return;
    set({ scanning: true });
    try {
      const result = await scanRepos();
      const stillThere = result.repos.some((r) => r.path === get().selectedPath);
      set((s) => ({
        repos: result.repos,
        elapsedMs: result.elapsed_ms,
        configPath: result.config_path,
        scanRoot: result.scan_root,
        scanError: null,
        hover: null,
        selectedBlock: null,
        // Falling back to the first row in display order, not the first in
        // scan order, so the highlight lands where the eye already is.
        selectedPath: stillThere
          ? s.selectedPath
          : (displayOrder(result.repos, s.mode)[0]?.path ?? null),
        detailOpen: s.detailOpen && stillThere,
        detail: stillThere ? s.detail : null,
      }));

      // Both drill-ins are stale now; refresh whichever one is open.
      if (get().detailOpen) await get().openDetail();
      const { activeRepo } = get();
      if (activeRepo) {
        // A repo that vanished between scans cannot stay on screen.
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

  showRepo: async (path) => {
    // Atlas is deliberately host-scoped and config-bounded. Refresh first so a
    // command-palette request cannot turn this IPC surface into an arbitrary
    // filesystem walk; only a repo the scan returned may be opened as a city.
    await get().refresh();
    const repo = get().repos.find((candidate) => candidate.path === path);
    if (!repo) {
      toast.error("Workspace is not in Atlas", {
        description: "Add this repository to atlas.toml, then refresh Atlas.",
      });
      return;
    }
    await get().enterRepo(repo.path);
  },

  setMode: (mode) => {
    if (get().mode === mode) return;
    // The canvas is unmounted while the list is up and cannot keep its camera
    // in sync with a changing scene, so it re-fits on the way back in.
    set((s) => ({ mode, fitNonce: mode === "map" ? s.fitNonce + 1 : s.fitNonce }));
  },

  toggleMode: () => get().setMode(get().mode === "list" ? "map" : "list"),

  select: (path) => {
    if (path === get().selectedPath) return;
    set({ selectedPath: path });
    if (get().detailOpen) void get().openDetail();
  },

  moveSelection: (delta) => {
    const { repos, selectedPath, mode } = get();
    if (repos.length === 0) return;
    const ordered = displayOrder(repos, mode);
    const idx = ordered.findIndex((r) => r.path === selectedPath);
    const next =
      idx === -1 ? 0 : Math.min(ordered.length - 1, Math.max(0, idx + delta));
    get().select(ordered[next].path);
  },

  selectedRepo: () => {
    const { repos, selectedPath } = get();
    return repos.find((r) => r.path === selectedPath) ?? null;
  },

  openDetail: async () => {
    const { selectedPath } = get();
    if (!selectedPath) return;
    set({ detailOpen: true, detailLoading: true });
    try {
      const detail = await fetchRepoDetail(selectedPath);
      // Selection may have moved while we were fetching.
      if (get().selectedPath === selectedPath) set({ detail });
    } catch (e) {
      toast.error("Could not load repo detail", { description: String(e) });
      set({ detailOpen: false, detail: null });
    } finally {
      set({ detailLoading: false });
    }
  },

  closeDetail: () => set({ detailOpen: false, detail: null }),

  toggleDetail: async () => {
    if (get().detailOpen) get().closeDetail();
    else await get().openDetail();
  },

  enterRepo: async (path) => {
    set({
      mode: "map",
      mapView: "city",
      activeRepo: path,
      // Drilling into a repo on the map selects it everywhere, so switching
      // back to the list lands on the same row.
      selectedPath: path,
      cityLoading: true,
      cityError: null,
      hover: null,
      selectedBlock: null,
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
      mapView: "atlas",
      activeRepo: null,
      city: null,
      cityError: null,
      hover: null,
      selectedBlock: null,
      fitNonce: s.fitNonce + 1,
    })),

  setHover: (block) => {
    if (get().hover?.id === block?.id) return;
    set({ hover: block });
  },

  setSelectedBlock: (block) => set({ selectedBlock: block }),

  setOmitted: (count) => {
    if (get().omitted === count) return;
    set({ omitted: count });
  },

  toggleLabels: () => set((s) => ({ showLabels: !s.showLabels })),

  requestFit: () => set((s) => ({ fitNonce: s.fitNonce + 1 })),
}));
