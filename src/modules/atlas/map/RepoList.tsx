import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft02Icon, GitBranchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useAtlasStore } from "@/modules/repos/store";
import { dirtyCount, formatCount, relativeTime, type RepoSummary } from "@/modules/repos/types";

/** The rail on the left: every repo the config found, and the way back out
 *  of a city. Deliberately text-only — the canvas is where the shapes live.
 *
 *  In the atlas it marks whatever the list view had selected, so switching
 *  over from the list lands on the repo you were already looking at. */
export function RepoList() {
  const repos = useAtlasStore((s) => s.repos);
  const view = useAtlasStore((s) => s.mapView);
  const activeRepo = useAtlasStore((s) => s.activeRepo);
  const selectedPath = useAtlasStore((s) => s.selectedPath);
  const enterRepo = useAtlasStore((s) => s.enterRepo);
  const backToAtlas = useAtlasStore((s) => s.backToAtlas);

  // Inside a city the rail marks where you are; out in the atlas it marks
  // the shared selection, which the list view may have set.
  const marked = view === "city" ? activeRepo : selectedPath;

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border/60 bg-card">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/60 px-3">
        {view === "city" ? (
          <Button
            variant="ghost"
            size="xs"
            className="-ml-1.5 gap-1.5"
            onClick={backToAtlas}
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} size={13} strokeWidth={2} />
            Atlas
          </Button>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">
            {repos.length} repositories
          </span>
        )}
      </div>

      <div className="nexis-scrollbar min-h-0 flex-1 overflow-y-auto py-1">
        {repos.map((repo) => (
          <RepoRow
            key={repo.path}
            repo={repo}
            active={repo.path === marked}
            onOpen={() => void enterRepo(repo.path)}
          />
        ))}
      </div>
    </aside>
  );
}

function RepoRow({
  repo,
  active,
  onOpen,
}: {
  repo: RepoSummary;
  active: boolean;
  onOpen: () => void;
}) {
  const dirty = dirtyCount(repo);

  return (
    <button
      type="button"
      onClick={onOpen}
      title={repo.path}
      className={cn(
        "flex w-full flex-col gap-0.5 border-l-2 px-3 py-1.5 text-left transition-colors",
        active
          ? "border-l-[var(--brand)] bg-accent/70"
          : "border-l-transparent hover:bg-accent/40",
      )}
    >
      <span className="flex items-center gap-1.5">
        <span className="truncate text-[13px] font-medium">{repo.name}</span>
        {dirty > 0 && (
          <span
            className="size-1.5 shrink-0 rounded-full bg-[var(--brand)]"
            aria-label={`${dirty} uncommitted changes`}
          />
        )}
      </span>
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <HugeiconsIcon icon={GitBranchIcon} size={11} strokeWidth={2} />
        <span className="truncate font-mono">{repo.branch || "—"}</span>
        <span className="ml-auto shrink-0 tabular-nums">
          {formatCount(repo.files)} files
        </span>
      </span>
      <span className="text-[11px] text-muted-foreground/60">
        {relativeTime(repo.last_commit?.time ?? null)}
        {repo.ahead > 0 && ` · ↑${repo.ahead}`}
        {repo.behind > 0 && ` · ↓${repo.behind}`}
      </span>
    </button>
  );
}
