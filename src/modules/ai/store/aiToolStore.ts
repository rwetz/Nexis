// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Which tool the AI window has in front.
 *
 * Everything that works *through the agent* lives in the AI window, not the
 * sidebar: the chat, the agent queue, refactor, prompt templates and code
 * review. They were four sidebar panels that each ended by handing work to a
 * chat that was somewhere else — and the hand-off called `openPanel()`, which
 * targets a docked panel that is never mounted, so it opened nothing at all.
 * Here the hand-off is `showAiChat()`: same window, one tab over.
 *
 * Reachable without React for the same reason as the bottom panel's store:
 * `persistSidebarView` routes the old view ids here, and stores (the agent
 * queue's worker) need to surface the chat.
 */

import type { IconName } from "@/components/icon";
import { create } from "zustand";
import { useChatStore } from "./chatStore";

export const AI_TOOL_IDS = ["chat", "agent-queue", "refactor", "prompt-templates", "code-review"] as const;
export type AiTool = (typeof AI_TOOL_IDS)[number];

export const AI_TOOLS: readonly { id: AiTool; label: string; icon: IconName }[] = [
  { id: "chat", label: "Chat", icon: "chat" },
  { id: "agent-queue", label: "Queue", icon: "tasks" },
  { id: "refactor", label: "Refactor", icon: "magic" },
  { id: "prompt-templates", label: "Templates", icon: "flash" },
  { id: "code-review", label: "Review", icon: "code-box" },
];

export function isAiTool(value: unknown): value is AiTool {
  return typeof value === "string" && (AI_TOOL_IDS as readonly string[]).includes(value);
}

type AiToolState = { tool: AiTool; setTool: (tool: AiTool) => void };

export const useAiToolStore = create<AiToolState>((set) => ({
  tool: "chat",
  setTool: (tool) => set({ tool }),
}));

/** Open the AI window with `tool` in front. */
export function showAiTool(tool: AiTool) {
  useAiToolStore.getState().setTool(tool);
  useChatStore.getState().openMini();
}

/** Surface the conversation — what a tool calls after sending the agent work. */
export function showAiChat() {
  showAiTool("chat");
}
