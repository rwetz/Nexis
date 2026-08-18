// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * SharingPill — persistent "🔴 Sharing on" status-bar indicator.
 *
 * Renders only while the LAN share server is running. Because share state is
 * global (not panel-local), this stays visible no matter which sidebar view
 * is open — the user can never *unknowingly* keep broadcasting a terminal.
 * Click opens the Share panel to manage or stop it.
 */
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useShareStore, shareUrl } from "./useShareServer";

export function SharingPill() {
  const status = useShareStore((s) => s.status);
  const port = useShareStore((s) => s.port);
  const token = useShareStore((s) => s.token);
  const bindChoice = useShareStore((s) => s.bindChoice);
  const lanIp = useShareStore((s) => s.lanIp);
  const target = useShareStore((s) => s.target);
  const live = useShareStore((s) => s.live);

  if (status !== "running") return null;

  const url = shareUrl({ status, port, token, bindChoice, lanIp });
  const what =
    target === "conversation"
      ? "AI conversation"
      : live
        ? "terminal (live)"
        : "terminal snapshot";
  const scope =
    bindChoice === "localhost"
      ? "this device only"
      : bindChoice === "lan"
        ? "LAN interface only"
        : "all networks";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent("nexis:open-sidebar-view", { detail: "share" }),
            );
          }}
          className="flex shrink-0 items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10.5px] font-medium text-red-600 transition-colors hover:bg-red-500/25 dark:text-red-400"
        >
          <span className="h-1.5 w-1.5 nexis-blink rounded-full bg-red-500" />
          <span>Sharing on</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-72 text-[11px] leading-relaxed">
        Sharing your {what} with anyone holding the link ({scope}).
        {url ? (
          <>
            {" "}
            <span className="font-mono text-[10px]">{url}</span>
          </>
        ) : null}{" "}
        Click to manage or stop.
      </TooltipContent>
    </Tooltip>
  );
}
