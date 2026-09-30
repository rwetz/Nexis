// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import type { OrbState } from "@/components/orbs/types";
import { useChatStore, type AgentRunStatus } from "../store/chatStore";

/**
 * The agent's run status as one of the orb's three states. Waiting on a tool
 * approval reads as thinking (work is in flight, nothing is being said), and
 * an error settles back to idle; the error itself is shown in the chat.
 */
export function orbStateFor(status: AgentRunStatus): OrbState {
  switch (status) {
    case "streaming":
      return "speaking";
    case "thinking":
    case "awaiting-approval":
      return "thinking";
    default:
      return "idle";
  }
}

/** Selects a string, never an object, so it cannot loop (pitfall #14). */
export function useAgentOrbState(): OrbState {
  return useChatStore((s) => orbStateFor(s.agentMeta.status));
}
