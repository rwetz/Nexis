// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";

export type PythonEnv = {
  name: string;
  path: string;
  python_path: string;
  kind: "venv" | "conda" | "system";
  version: string | null;
};

const STORAGE_KEY_PREFIX = "nexis.python.active:";

function storageKey(workspaceRoot: string): string {
  return `${STORAGE_KEY_PREFIX}${workspaceRoot}`;
}

function readActiveEnvPath(workspaceRoot: string): string | null {
  try {
    return window.localStorage.getItem(storageKey(workspaceRoot));
  } catch {
    return null;
  }
}

function writeActiveEnvPath(workspaceRoot: string, path: string | null): void {
  try {
    if (path === null) {
      window.localStorage.removeItem(storageKey(workspaceRoot));
    } else {
      window.localStorage.setItem(storageKey(workspaceRoot), path);
    }
  } catch {
    // ignore
  }
}

type State = {
  envs: PythonEnv[];
  activeEnv: PythonEnv | null;
  loading: boolean;
};

export function usePythonEnv(workspaceRoot: string | null) {
  const [state, setState] = useState<State>({
    envs: [],
    activeEnv: null,
    loading: false,
  });
  const workspaceRootRef = useRef(workspaceRoot);
  workspaceRootRef.current = workspaceRoot;

  const detect = useCallback(async (root: string) => {
    setState((prev) => ({ ...prev, loading: true }));
    try {
      const envs = await invoke<PythonEnv[]>("py_detect_envs", {
        workspaceRoot: root,
      });
      const savedPath = readActiveEnvPath(root);
      const active =
        envs.find((e) => e.path === savedPath) ??
        envs.find((e) => e.kind === "venv") ??
        envs[0] ??
        null;
      setState({ envs, activeEnv: active, loading: false });
    } catch {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    if (!workspaceRoot) {
      setState({ envs: [], activeEnv: null, loading: false });
      return;
    }
    void detect(workspaceRoot);
  }, [workspaceRoot, detect]);

  const setActiveEnv = useCallback(
    (env: PythonEnv | null) => {
      const root = workspaceRootRef.current;
      if (root) writeActiveEnvPath(root, env?.path ?? null);
      setState((prev) => ({ ...prev, activeEnv: env }));
    },
    [],
  );

  const refresh = useCallback(() => {
    const root = workspaceRootRef.current;
    if (root) void detect(root);
  }, [detect]);

  return { ...state, setActiveEnv, refresh };
}
