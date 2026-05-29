import { useChatStore } from "@/modules/ai";
import { AgentStatusPill } from "@/modules/ai/components/AgentStatusPill";
import {
  AiOpenButton,
  AiStatusBarControls,
} from "@/modules/ai/components/AiStatusBarControls";
import { NotificationsCenter } from "@/modules/notifications";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { IncognitoIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { CwdBreadcrumb } from "./CwdBreadcrumb";
import { WorkspaceEnvSelector } from "./WorkspaceEnvSelector";
import type { WorkspaceEnv } from "@/modules/workspace";
import { useDiagnosticsStore } from "@/modules/problems/diagnosticsStore";
import { usePluginRegistry } from "@/lib/plugins/registry";
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
}: Props) {
  const panelOpen = useChatStore((s) => s.panelOpen);
  const openPanel = useChatStore((s) => s.openPanel);
  const errorCount = useDiagnosticsStore((s) => s.errorCount);
  const warningCount = useDiagnosticsStore((s) => s.warningCount);

  // Plugin-contributed status bar items, sorted by priority (desc).
  const leftItems = usePluginRegistry((s) =>
    s.statusBarItems.filter((i) => i.side === "left"),
  );
  const rightItems = usePluginRegistry((s) =>
    s.statusBarItems.filter((i) => i.side === "right"),
  );

  return (
    <footer className="flex h-8 shrink-0 items-center justify-start gap-3 border-t border-border/60 bg-card/60 px-3 text-[11px]">
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
                  "flex shrink-0 items-center gap-2 rounded px-1.5 py-0.5 text-[10.5px] transition-colors",
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
            <TooltipContent side="top" className="text-[11px]">
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

        {privateActive ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex shrink-0 cursor-default items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10.5px] font-medium text-amber-700 dark:text-amber-400">
                <HugeiconsIcon icon={IncognitoIcon} size={11} strokeWidth={2} />
                <span>Private: hidden from AI</span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-64 text-[11px] leading-relaxed">
              AI can't see this terminal's output. Use it for secrets, SSH, or
              anything you don't want sent to the model.
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {/* Plugin-contributed right items (e.g. Python env pill) */}
        {rightItems.map((item) => {
          const C = item.render;
          return <span key={item.id}><C /></span>;
        })}
        <NotificationsCenter />
        <AgentStatusPill onClick={onOpenMini} />
        {panelOpen && hasComposer ? (
          <AiStatusBarControls />
        ) : (
          <AiOpenButton onOpen={openPanel} />
        )}
      </div>
    </footer>
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
