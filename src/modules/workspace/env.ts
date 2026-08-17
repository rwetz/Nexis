// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { setLastWslDistro } from "@/modules/settings/store";

export type WorkspaceEnv =
  | { kind: "local" }
  | { kind: "wsl"; distro: string };

export type WslDistro = {
  name: string;
  default: boolean;
  running: boolean;
};

type State = {
  env: WorkspaceEnv;
  distros: WslDistro[];
  loading: boolean;
  error: string | null;
  setEnv: (env: WorkspaceEnv) => void;
  refreshDistros: () => Promise<WslDistro[]>;
};

export const LOCAL_WORKSPACE: WorkspaceEnv = { kind: "local" };

export const useWorkspaceEnvStore = create<State>((set) => ({
  env: LOCAL_WORKSPACE,
  distros: [],
  loading: false,
  error: null,
  setEnv: (env) => {
    set({ env });
    if (env.kind === "wsl") void setLastWslDistro(env.distro);
  },
  refreshDistros: async () => {
    set({ loading: true, error: null });
    try {
      const distros = await invoke<WslDistro[]>("wsl_list_distros");
      set({ distros, loading: false });
      return distros;
    } catch (e) {
      set({ distros: [], loading: false, error: String(e) });
      return [];
    }
  },
}));

export function currentWorkspaceEnv(): WorkspaceEnv {
  return useWorkspaceEnvStore.getState().env;
}

/**
 * The workspace environment implied by an absolute path.
 *
 * Every git and fs IPC call stamps `currentWorkspaceEnv()` onto its payload,
 * and the Rust side uses it to decide whether to run through `wsl.exe` or
 * natively. Switching the workspace *by path* — Recent Workspaces, opening a
 * worktree, a profile root — therefore has to update the env too; leaving a
 * stale `local` behind makes the backend run Windows `git.exe` against a
 * `\\wsl.localhost\…` UNC path, which reads the Windows .gitconfig rather than
 * the distro's and fails with "author identity unknown" on commit.
 *
 * `current` is used only to keep the distro when the path is POSIX-absolute
 * but carries no distro of its own (`/home/me/x` while already in WSL). On
 * non-Windows `current` is always local, so that branch collapses correctly.
 */
export function workspaceEnvForPath(
  path: string,
  current: WorkspaceEnv,
): WorkspaceEnv {
  // \\wsl.localhost\<distro>\... or the legacy \\wsl$\<distro>\...
  const unc = /^[\\/]{2}wsl(?:\.localhost|\$)[\\/]+([^\\/]+)/i.exec(path);
  if (unc) return { kind: "wsl", distro: unc[1] };
  // A drive-letter path is unambiguously native Windows.
  if (/^[a-zA-Z]:[\\/]/.test(path)) return LOCAL_WORKSPACE;
  // POSIX-absolute with no distro in it: only meaningful if already in WSL.
  if (path.startsWith("/") && current.kind === "wsl") return current;
  return LOCAL_WORKSPACE;
}

export function workspaceScopeKey(env: WorkspaceEnv): string {
  return env.kind === "wsl" ? `wsl:${env.distro}` : "local";
}

export function currentWorkspaceScopeKey(): string {
  return workspaceScopeKey(currentWorkspaceEnv());
}

export async function getWslHome(distro: string): Promise<string> {
  return invoke<string>("wsl_home", { distro });
}
