// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Workspace profiles — named configurations bundling a working directory,
 * optional env var overrides, and an optional startup shell command.
 *
 * Persisted in localStorage so no Tauri store plugin overhead.
 */
import { create } from "zustand";

const STORAGE_KEY = "nexis.workspace-profiles";

export type WorkspaceProfile = {
  id: string;
  name: string;
  rootPath: string;
  /** Extra env vars injected into every new terminal opened in this profile. */
  envVars: Record<string, string>;
  /** Optional command written to the first new terminal when the profile is activated. */
  startupCommand: string;
  createdAt: number;
};

type State = {
  profiles: WorkspaceProfile[];
  add: (profile: Omit<WorkspaceProfile, "id" | "createdAt">) => WorkspaceProfile;
  update: (id: string, patch: Partial<Omit<WorkspaceProfile, "id" | "createdAt">>) => void;
  remove: (id: string) => void;
};

function load(): WorkspaceProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WorkspaceProfile[]) : [];
  } catch {
    return [];
  }
}

function persist(profiles: WorkspaceProfile[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  } catch {
    // quota error — ignore
  }
}

function newId(): string {
  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export const useProfilesStore = create<State>((set, get) => ({
  profiles: load(),

  add(data) {
    const profile: WorkspaceProfile = {
      ...data,
      id: newId(),
      createdAt: Date.now(),
    };
    const next = [...get().profiles, profile];
    persist(next);
    set({ profiles: next });
    return profile;
  },

  update(id, patch) {
    const next = get().profiles.map((p) =>
      p.id === id ? { ...p, ...patch } : p,
    );
    persist(next);
    set({ profiles: next });
  },

  remove(id) {
    const next = get().profiles.filter((p) => p.id !== id);
    persist(next);
    set({ profiles: next });
  },
}));
