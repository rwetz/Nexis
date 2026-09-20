// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The longest-running background process, as a status-bar chip.
 *
 * Before this, a `shell_bg` process was only visible if the Activity panel
 * happened to be open — so a dev server the user started twenty minutes ago
 * and forgot about was invisible and unkillable from the main window. The
 * chip makes exactly one of them ambient: the oldest live one, which is the
 * one most likely to have been forgotten.
 *
 * Only one is shown on purpose. The status bar is a fixed-height strip shared
 * with the cwd breadcrumb, problems, and the AI controls; a chip per process
 * would push all of that off-screen the moment someone ran three servers. The
 * count badge points at the panel that lists the rest.
 */

import { CallChip } from "@/components/ui/CallChip";
import { useBackgroundProcesses } from "@/modules/processes/useBackgroundProcesses";

/** Short label for a chip that shares a 6px-tall strip with everything else. */
function shortCommand(command: string): string {
  const trimmed = command.trim();
  // The first token is the program; that is what identifies it at a glance.
  // `npm run dev` keeps its argument because the program alone says nothing.
  const parts = trimmed.split(/\s+/);
  if (parts.length <= 2) return trimmed;
  return `${parts[0]} ${parts[1]}`;
}

type Props = {
  /** Opens the Activity panel, which lists every background process. */
  onOpenActivity?: () => void;
};

export function RunningProcessChip({ onOpenActivity }: Props) {
  const { processes, kill } = useBackgroundProcesses();

  const live = processes.filter((p) => !p.exited);
  if (live.length === 0) return null;

  // Oldest first — the forgotten one is the one worth surfacing.
  const oldest = live.reduce((a, b) =>
    a.started_at_ms <= b.started_at_ms ? a : b,
  );

  return (
    <span className="flex shrink-0 items-center gap-1">
      <CallChip
        label={shortCommand(oldest.command)}
        startedAtMs={oldest.started_at_ms}
        onEnd={() => void kill(oldest.handle)}
        onClick={onOpenActivity}
        endLabel="Kill"
      />
      {live.length > 1 && (
        <button
          type="button"
          onClick={onOpenActivity}
          className="shrink-0 tabular-nums text-[10.5px] text-muted-foreground transition-colors hover:text-foreground"
          title={`${live.length} background processes running`}
        >
          +{live.length - 1}
        </button>
      )}
    </span>
  );
}
