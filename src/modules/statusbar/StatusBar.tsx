// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Icon } from "@/components/icon";
import { useChatStore } from "@/modules/ai";
import { AgentStatusPill } from "@/modules/ai/components/AgentStatusPill";
import { AiOpenButton } from "@/modules/ai/components/AiStatusBarControls";
import { NotificationsCenter } from "@/modules/notifications";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CwdBreadcrumb } from "./CwdBreadcrumb";
import { WorkspaceEnvSelector } from "./WorkspaceEnvSelector";
import type { WorkspaceEnv } from "@/platform/workspaces";
import { useDiagnosticsStore } from "@/modules/problems/diagnosticsStore";
import { usePluginRegistry } from "@/lib/plugins/registry";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { SharingPill } from "@/modules/share";
import { MemoryReportPill } from "./MemoryReportPill";
import { MissingToolsPill } from "./MissingToolsPill";
import { RunningProcessChip } from "./RunningProcessChip";
import { FpsPill } from "./FpsPill";
import { PanelToggle } from "./PanelToggle";
import { cn } from "@/lib/utils";

type Props = {
  cwd: string | null;
  filePath?: string | null;
  home: string | null;
  onCd: (path: string) => void;
  onWorkspaceChange: (env: WorkspaceEnv) => void;
  onOpenMini: () => void;
  /** Only rendered when the AI panel is open and a key is loaded. */
  hasComposer: boolean;
  privateActive: boolean;
  problemsOpen?: boolean;
  onToggleProblems?: () => void;
  /** Reveals the Activity panel, which owns the full background-process list. */
  onOpenActivity?: () => void;
};

export function StatusBar({
  cwd,
  filePath,
  home,
  onCd,
  onWorkspaceChange,
  onOpenMini,
  hasComposer,
  privateActive,
  problemsOpen = false,
  onToggleProblems,
  onOpenActivity,
}: Props) {
  const toggleMini = useChatStore((s) => s.toggleMini);
  const errorCount = useDiagnosticsStore((s) => s.errorCount);
  const warningCount = useDiagnosticsStore((s) => s.warningCount);
  const debugMemoryReport = usePreferencesStore((s) => s.debugMemoryReport);
  const debugFpsMeter = usePreferencesStore((s) => s.debugFpsMeter);

  // Plugin-contributed status bar items — select the stable array from the
  // store, then filter locally so the selector never returns a new reference
  // on every call (which would trigger an infinite useSyncExternalStore loop).
  const statusBarItems = usePluginRegistry((s) => s.statusBarItems);
  const leftItems = statusBarItems.filter((i) => i.side === "left");
  const rightItems = statusBarItems.filter((i) => i.side === "right");

  return (
    <footer className="relative flex h-8 shrink-0 items-center justify-start gap-3 bg-card/60 px-3 text-caption">
      {/* Gradient top border */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <WorkspaceEnvSelector onSelect={onWorkspaceChange} />
        <CwdBreadcrumb cwd={cwd} filePath={filePath} home={home} onCd={onCd} />
        {onToggleProblems && (problemsOpen || errorCount > 0 || warningCount > 0) && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onToggleProblems}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded px-1.5 py-0.5 text-caption transition-colors",
                  problemsOpen
                    ? "bg-muted/60 text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {errorCount > 0 && (
                  <span className="flex items-center gap-1 text-red-400">
                    <ErrorDot />
                    {errorCount}
                  </span>
                )}
                {warningCount > 0 && (
                  <span className="flex items-center gap-1 text-yellow-400">
                    <WarnDot />
                    {warningCount}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-caption">
              {problemsOpen ? "Hide" : "Show"} Problems
            </TooltipContent>
          </Tooltip>
        )}

        {/* Plugin-contributed left items (e.g. container badge) */}
        {leftItems.map((item) => {
          // Use the render fn as a component (`<C />`) — not a plain call — so
          // React enforces a proper component boundary. This prevents hooks
          // inside render() from running in StatusBar's fiber instead of their
          // own, which would violate Rules of Hooks silently.
          const C = item.render;
          return <span key={item.id}><C /></span>;
        })}

        {/* Always mounted while sharing runs — not gated by pack or panel */}
        <SharingPill />
        <MissingToolsPill />
        <RunningProcessChip onOpenActivity={onOpenActivity} />

        {privateActive ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex shrink-0 cursor-default items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-caption font-medium text-amber-700 dark:text-amber-400">
                <Icon name="incognito" size="xs" />
                <span>Private: hidden from AI</span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-64 text-caption leading-relaxed">
              AI can't see this terminal's output. Use it for secrets, SSH, or
              anything you don't want sent to the model.
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {/* Right side, in two groups: tools and readouts, then a hairline, then
        * the things that talk back (notifications, the agent). */}
      <div className="flex shrink-0 items-center gap-1.5">
        <PanelToggle />
        <DiagnosticsPill fps={debugFpsMeter} memory={debugMemoryReport} />
        {/* Plugin-contributed right items (e.g. Python env pill) */}
        {rightItems.map((item) => {
          const C = item.render;
          return <span key={item.id}><C /></span>;
        })}
        <div aria-hidden className="mx-1 h-3.5 w-px shrink-0 bg-border/70" />
        <NotificationsCenter />
        <AgentStatusPill onClick={onOpenMini} />
        {hasComposer ? <AiOpenButton onOpen={toggleMini} /> : null}
      </div>
    </footer>
  );
}

/**
 * The opt-in debug readouts (Settings > Developer) as one quiet pill. At rest
 * it shows only the frame rate; the memory summary slides out beside it while
 * the pointer is over the pill. With only one readout enabled, that one shows.
 * Each readout keeps its own detail tooltip.
 */
function DiagnosticsPill({ fps, memory }: { fps: boolean; memory: boolean }) {
  if (!fps && !memory) return null;
  const folded = fps && memory;
  return (
    <div className="group/diag flex h-6 shrink-0 items-center rounded-md bg-muted/40 px-2">
      {fps ? <FpsPill /> : null}
      {memory ? (
        <div
          className={cn(
            folded &&
              "grid grid-cols-[0fr] opacity-0 transition-[grid-template-columns,opacity] duration-(--dur-panel) group-hover/diag:grid-cols-[1fr] group-hover/diag:opacity-100",
          )}
        >
          <div className={cn(folded && "min-w-0 overflow-hidden pl-2")}>
            <MemoryReportPill />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ErrorDot() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor">
      <circle cx="8" cy="8" r="6.5" strokeWidth="1.2" />
      <path d="M8 5v3.5M8 10.5v1" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function WarnDot() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor">
      <path d="M8 2L1.5 13.5h13L8 2z" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M8 6.5v3M8 11v1" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
