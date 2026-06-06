// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Python plugin — detects Python environments in the active workspace and
 * contributes a status bar pill for switching between them.
 *
 * Replaces the old App.tsx props-threading pattern:
 *   usePythonEnv → pythonEnvs/activePythonEnv/pythonLoading → StatusBar props
 *
 * Now fully self-contained: the plugin component subscribes to the workspace
 * root via `useChatStore`, owns its own state, and registers itself into the
 * status bar registry.
 */
import type { Plugin } from "@/lib/plugins/types";
import { createElement } from "react";
import { useChatStore } from "@/modules/ai/store/chatStore";
import { usePythonEnv, type PythonEnv } from "@/modules/python/usePythonEnv";
import { PythonEnvPill } from "@/modules/python/PythonEnvPill";

// ── Status bar item component ─────────────────────────────────────────────────

function PythonStatusBarItem() {
  // Calling live.getWorkspaceRoot() inside the selector returns a string (or
  // null). Zustand compares by value, so this only re-renders when the root
  // actually changes.
  const workspaceRoot = useChatStore((s) => s.live.getWorkspaceRoot());

  const { envs, activeEnv, loading, setActiveEnv, refresh } =
    usePythonEnv(workspaceRoot);

  if (!workspaceRoot || (envs.length === 0 && !loading)) return null;

  return createElement(PythonEnvPill, {
    envs,
    activeEnv,
    loading,
    onSelect: (env: PythonEnv | null) => setActiveEnv(env),
    onRefresh: refresh,
  });
}

// ── Plugin definition ─────────────────────────────────────────────────────────

export const pythonPlugin: Plugin = {
  id: "nexis.python",
  name: "Python Environment",

  activate(api) {
    return api.registerStatusBarItem({
      id: "nexis.python:env-pill",
      side: "right",
      priority: 100,
      render: () => createElement(PythonStatusBarItem),
    });
  },
};
