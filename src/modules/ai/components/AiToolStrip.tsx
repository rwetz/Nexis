// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The AI window's tools: Chat, and everything that works through the agent.
 *
 * Queue, Refactor, Templates and Review were sidebar panels, each of which
 * ended by sending the agent work and then trying to show a chat that lived
 * somewhere else. In one window the hand-off is a tab switch. They were built
 * for a ~280px sidebar column, which is about the width of this window, so
 * they fit as they are.
 *
 * Chat stays mounted underneath another tool (hidden with `invisible`, not
 * unmounted): the `useChat` binding and a streaming reply must not reset
 * because you glanced at the queue. The other tools mount on demand.
 */

import { RailIndicator } from "@/components/ui/rail-indicator";
import { Icon } from "@/components/icon";
import { useGlidingRail } from "@/components/ui/use-gliding-rail";
import { packEnabled, packForView } from "@/lib/packs";
import { cn } from "@/lib/utils";
import { AgentQueuePanel } from "@/modules/agent-queue";
import { CodeReviewPanel } from "@/modules/code-review";
import { PromptTemplatesPanel } from "@/modules/prompt-templates";
import { RefactorPanel } from "@/modules/refactor";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { ReactNode } from "react";
import { AI_TOOLS, useAiToolStore, type AiTool } from "../store/aiToolStore";

/** Tools whose pack is on. Chat and the queue are core. */
export function useVisibleAiTools() {
  const enabledPacks = usePreferencesStore((s) => s.enabledPacks);
  return AI_TOOLS.filter(
    (t) => t.id === "chat" || t.id === "agent-queue" || packEnabled(packForView(t.id), enabledPacks),
  );
}

export function AiToolStrip() {
  const tool = useAiToolStore((s) => s.tool);
  const setTool = useAiToolStore((s) => s.setTool);
  const tools = useVisibleAiTools();
  const active = tools.some((t) => t.id === tool) ? tool : "chat";
  const rail = useGlidingRail<AiTool>(active, "horizontal", tools.length);
  if (tools.length < 2) return null;

  return (
    <div
      ref={rail.containerRef}
      role="tablist"
      aria-label="AI tools"
      className="relative flex shrink-0 items-center gap-0.5 border-b border-border/40 px-2.5 py-1"
      onPointerLeave={() => rail.setHoverId(null)}
    >
      <RailIndicator
        rail={rail}
        rect={rail.activeRect}
        radius={8}
        className="inset-y-1 bg-primary/12"
      />
      {tools.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          ref={(el) => rail.registerItem(t.id, el)}
          onClick={() => setTool(t.id)}
          onPointerEnter={() => rail.setHoverId(t.id)}
          className={cn(
            "relative z-10 flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            active === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon name={t.icon} size="xs" active={active === t.id} />
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** The window body: chat (always mounted) under whichever tool is in front. */
export function AiToolStack({
  chat,
  workspaceRoot,
}: {
  chat: ReactNode;
  /** Code Review diffs the workspace. */
  workspaceRoot: string | null;
}) {
  const tool = useAiToolStore((s) => s.tool);
  const tools = useVisibleAiTools();
  const active = tools.some((t) => t.id === tool) ? tool : "chat";
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        inert={active !== "chat"}
        aria-hidden={active !== "chat"}
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          active !== "chat" && "invisible pointer-events-none",
        )}
      >
        {chat}
      </div>
      {active !== "chat" && (
        <div className="absolute inset-0 overflow-y-auto">
          <ToolBody tool={active} workspaceRoot={workspaceRoot} />
        </div>
      )}
    </div>
  );
}

function ToolBody({
  tool,
  workspaceRoot,
}: {
  tool: Exclude<AiTool, "chat">;
  workspaceRoot: string | null;
}) {
  switch (tool) {
    case "agent-queue":
      return <AgentQueuePanel />;
    case "refactor":
      return <RefactorPanel />;
    case "prompt-templates":
      return <PromptTemplatesPanel />;
    case "code-review":
      return <CodeReviewPanel workspaceRoot={workspaceRoot} />;
  }
}
