import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  cancelBenchmark,
  listBackends,
  onProgress,
  onResult,
  probeLlama,
  runBenchmark,
} from "@/lib/api";
import { DEMO_MODELS } from "@/lib/mockEngine";
import { IS_TAURI } from "@/lib/platform";
import {
  type BackendId,
  type BackendInfo,
  type BenchConfig,
  type BenchJob,
  type BenchProgress,
  type BenchResult,
  type BenchRun,
  type ModelInfo,
  type Preset,
  cellKey,
  DEFAULT_CONFIG,
} from "@/lib/types";

let uid = 0;
const nextId = (p: string) => `${p}-${Date.now().toString(36)}-${(uid++).toString(36)}`;

interface BenchState {
  initialized: boolean;
  models: ModelInfo[];
  backends: BackendInfo[];
  selectedModelIds: string[];
  selectedBackendIds: BackendId[];
  config: BenchConfig;
  presets: Preset[];
  llamaBenchPath: string | null;

  running: boolean;
  jobId: string | null;
  run: BenchRun | null;
  history: BenchRun[];
  /** Live progress keyed by `${modelId}::${backendId}`. */
  progress: Record<string, BenchProgress>;

  init: () => Promise<void>;
  addModels: (models: ModelInfo[]) => void;
  removeModel: (id: string) => void;
  toggleModel: (id: string) => void;
  toggleBackend: (id: BackendId) => void;
  setConfig: (patch: Partial<BenchConfig>) => void;
  setLlamaBench: (path: string | null) => Promise<void>;

  savePreset: (name: string) => void;
  applyPreset: (id: string) => void;
  deletePreset: (id: string) => void;

  loadRun: (id: string) => void;
  deleteRun: (id: string) => void;
  clearHistory: () => void;

  startRun: () => Promise<void>;
  cancelRun: () => Promise<void>;
  /** Cells (model × backend) eligible to run given current selection. */
  plannedMatrix: () => { modelId: string; backendId: BackendId }[];
}

export const useBenchStore = create<BenchState>()(
  persist(
    (set, get) => ({
      initialized: false,
      models: [],
      backends: [],
      selectedModelIds: [],
      selectedBackendIds: ["nexis", "onnx"],
      config: DEFAULT_CONFIG,
      presets: [],
      llamaBenchPath: null,

      running: false,
      jobId: null,
      run: null,
      history: [],
      progress: {},

      init: async () => {
        if (get().initialized) return;
        let backends = await listBackends();
        // Seed demo models only for a fresh browser session (nothing persisted).
        if (get().models.length === 0 && !IS_TAURI) {
          set({
            models: DEMO_MODELS,
            selectedModelIds: DEMO_MODELS.map((m) => m.id),
          });
        }
        // Re-validate a previously located llama-bench binary.
        const llamaPath = get().llamaBenchPath;
        if (IS_TAURI && llamaPath) {
          try {
            const probe = await probeLlama(llamaPath);
            backends = backends.map((b) =>
              b.id === "llama"
                ? { ...b, available: probe.available, version: probe.version ?? b.version }
                : b,
            );
          } catch {
            /* leave llama as detected */
          }
        }
        const available = backends.filter((b) => b.available).map((b) => b.id);
        const selectedBackendIds = get().selectedBackendIds.filter((id) =>
          available.includes(id),
        );
        // Show the most recent run's results on load if there's no live run.
        const { run, history } = get();
        set({
          initialized: true,
          backends,
          selectedBackendIds:
            selectedBackendIds.length > 0 ? selectedBackendIds : available.slice(0, 2),
          run: run ?? history[0] ?? null,
        });
      },

      addModels: (incoming) =>
        set((s) => {
          const byPath = new Map(s.models.map((m) => [m.path, m]));
          for (const m of incoming) byPath.set(m.path, m);
          const models = [...byPath.values()];
          const newIds = incoming.map((m) => m.id);
          const selectedModelIds = [...new Set([...s.selectedModelIds, ...newIds])];
          return { models, selectedModelIds };
        }),

      removeModel: (id) =>
        set((s) => ({
          models: s.models.filter((m) => m.id !== id),
          selectedModelIds: s.selectedModelIds.filter((x) => x !== id),
        })),

      toggleModel: (id) =>
        set((s) => ({
          selectedModelIds: s.selectedModelIds.includes(id)
            ? s.selectedModelIds.filter((x) => x !== id)
            : [...s.selectedModelIds, id],
        })),

      toggleBackend: (id) =>
        set((s) => ({
          selectedBackendIds: s.selectedBackendIds.includes(id)
            ? s.selectedBackendIds.filter((x) => x !== id)
            : [...s.selectedBackendIds, id],
        })),

      setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),

      setLlamaBench: async (path) => {
        const probe = await probeLlama(path);
        set((s) => ({
          llamaBenchPath: probe.path ?? path,
          backends: s.backends.map((b) =>
            b.id === "llama"
              ? { ...b, available: probe.available, version: probe.version ?? b.version }
              : b,
          ),
          selectedBackendIds:
            probe.available && !s.selectedBackendIds.includes("llama")
              ? [...s.selectedBackendIds, "llama"]
              : s.selectedBackendIds,
        }));
      },

      savePreset: (name) =>
        set((s) => ({
          presets: [
            ...s.presets.filter((p) => p.name !== name),
            { id: nextId("preset"), name, config: s.config },
          ],
        })),

      applyPreset: (id) =>
        set((s) => {
          const p = s.presets.find((x) => x.id === id);
          return p ? { config: { ...p.config } } : {};
        }),

      deletePreset: (id) =>
        set((s) => ({ presets: s.presets.filter((p) => p.id !== id) })),

      loadRun: (id) =>
        set((s) => {
          if (s.running) return {};
          const r = s.history.find((h) => h.id === id);
          return r ? { run: r, progress: {} } : {};
        }),

      deleteRun: (id) =>
        set((s) => {
          const history = s.history.filter((h) => h.id !== id);
          return {
            history,
            run: s.run?.id === id ? (history[0] ?? null) : s.run,
          };
        }),

      clearHistory: () => set({ history: [] }),

      plannedMatrix: () => {
        const s = get();
        const backends = new Map(s.backends.map((b) => [b.id, b]));
        const cells: { modelId: string; backendId: BackendId }[] = [];
        for (const modelId of s.selectedModelIds) {
          const model = s.models.find((m) => m.id === modelId);
          if (!model) continue;
          for (const backendId of s.selectedBackendIds) {
            const b = backends.get(backendId);
            if (!b || !b.available) continue;
            if (!b.supports.includes(model.format)) continue;
            cells.push({ modelId, backendId });
          }
        }
        return cells;
      },

      startRun: async () => {
        const s = get();
        if (s.running) return;
        const matrix = s.plannedMatrix();
        if (matrix.length === 0) return;

        const jobId = nextId("job");
        const models = s.models.filter((m) => s.selectedModelIds.includes(m.id));
        const run: BenchRun = {
          id: jobId,
          createdAt: new Date().toISOString(),
          config: s.config,
          matrix,
          results: [],
        };
        set({ running: true, jobId, run, progress: {} });

        const job: BenchJob = {
          jobId,
          config: s.config,
          models,
          backendIds: s.selectedBackendIds,
          llamaBenchPath: s.llamaBenchPath,
        };
        await runBenchmark(job);
      },

      cancelRun: async () => {
        const { jobId } = get();
        if (jobId) await cancelBenchmark(jobId);
        set({ running: false });
      },
    }),
    {
      name: "nexis-bench-state",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Persist the durable bits; live run state stays ephemeral.
      partialize: (s) => ({
        models: s.models,
        selectedModelIds: s.selectedModelIds,
        selectedBackendIds: s.selectedBackendIds,
        config: s.config,
        presets: s.presets,
        history: s.history,
        llamaBenchPath: s.llamaBenchPath,
      }),
    },
  ),
);

// ── Engine stream → store ────────────────────────────────────────────────────

function handleProgress(p: BenchProgress) {
  const s = useBenchStore.getState();
  if (p.jobId !== s.jobId) return;
  useBenchStore.setState((cur) => ({
    progress: { ...cur.progress, [cellKey(p.modelId, p.backendId)]: p },
  }));
}

function handleResult(r: BenchResult) {
  useBenchStore.setState((cur) => {
    if (!cur.run) return {};
    const inMatrix = cur.run.matrix.some(
      (c) => c.modelId === r.modelId && c.backendId === r.backendId,
    );
    if (!inMatrix) return {};
    const results = [...cur.run.results.filter((x) => x.id !== r.id), r];
    const run = { ...cur.run, results };
    const done = run.matrix.length > 0 && results.length >= run.matrix.length;
    return {
      run,
      running: done ? false : cur.running,
      history: done
        ? [run, ...cur.history.filter((h) => h.id !== run.id)].slice(0, 50)
        : cur.history,
    };
  });
}

onProgress(handleProgress);
onResult(handleResult);
