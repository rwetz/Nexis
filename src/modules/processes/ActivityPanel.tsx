// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * ActivityPanel — a single "see and cancel everything" view that stacks the
 * background shell processes (top) and the AI agent queue (bottom). Each
 * section keeps its own header, scroll, and per-item cancel/kill controls;
 * this just composes them so there's one place to manage all running work.
 */
import { AgentQueuePanel } from "@/modules/agent-queue";
import { BackgroundProcessPanel } from "./BackgroundProcessPanel";

export function ActivityPanel() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden">
        <BackgroundProcessPanel />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden border-t border-border/50">
        <AgentQueuePanel />
      </div>
    </div>
  );
}
