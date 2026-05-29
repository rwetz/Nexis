/**
 * Container plugin — detects container config (Dockerfile, docker-compose,
 * devcontainer.json) in the active workspace root and contributes a status
 * bar badge.
 */
import type { Plugin } from "@/lib/plugins/types";
import { createElement } from "react";
import { useChatStore } from "@/modules/ai/store/chatStore";
import { useContainerEnv } from "@/modules/containers/useContainerEnv";
import { ContainerPill } from "@/modules/containers/ContainerPill";

// ── Status bar item component ─────────────────────────────────────────────────

function ContainerStatusBarItem() {
  const workspaceRoot = useChatStore((s) => s.live.getWorkspaceRoot());
  const env = useContainerEnv(workspaceRoot);

  if (!env) return null;
  return createElement(ContainerPill, { env });
}

// ── Plugin definition ─────────────────────────────────────────────────────────

export const containersPlugin: Plugin = {
  id: "nexis.containers",
  name: "Container Environment",

  activate(api) {
    return api.registerStatusBarItem({
      id: "nexis.containers:badge",
      side: "left",
      priority: 100,
      render: () => createElement(ContainerStatusBarItem),
    });
  },
};
