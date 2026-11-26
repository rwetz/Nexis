import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { relativeTime } from "@/modules/atlas/lib/time";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useRef } from "react";
import { useAtlasStore } from "@/modules/atlas/repos/store";
import {
  displayOrder,
  prsFor,
  repoState,
  staleBranchCount,
  STATE_META,
  type ListSort,
  type PrCounts,
  type RepoSummary,
} from "@/modules/atlas/repos/types";

const GRID =
  "grid grid-cols-[minmax(150px,1.1fr)_minmax(110px,0.8fr)_86px_120px_150px_minmax(160px,1.4fr)_80px] items-center gap-x-3";

export function RepoTable() {
  const repos = useAtlasStore((s) => s.repos);
  const selectedPath = useAtlasStore((s) => s.selectedPath);
  const listSort = useAtlasStore((s) => s.listSort);
  const attentionOnly = useAtlasStore((s) => s.attentionOnly);
  const prs = useAtlasStore((s) => s.prs);
  const toggleAttentionOnly = useAtlasStore((s) => s.toggleAttentionOnly);
  const containerRef = useRef<HTMLDivElement>(null);

  // The backend orders repos biggest-first for the map's treemap; a table
  // wants its own order. `moveSelection` walks this same order, so keyboard
  // selection follows the sort and the "needs attention" filter.
  const rows = useMemo(
    () => displayOrder(repos, "list", { sort: listSort, attentionOnly, prs }),
    [repos, listSort, attentionOnly, prs],
  );

  // Keep the keyboard selection in view.
  useEffect(() => {
    containerRef.current
      ?.querySelector('[data-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedPath]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div
        className={cn(
          GRID,
          "shrink-0 border-b border-border/60 px-4 py-2 text-ui font-medium text-muted-foreground select-none",
        )}
      >
        <SortHeader sort="name" className="pl-5">Repository</SortHeader>
        <span>Branch</span>
        <span>Sync</span>
        <SortHeader sort="changes">Changes</SortHeader>
        <SortHeader sort="attention" title="Stale branches, linked worktrees and open PRs">
          Health
        </SortHeader>
        <span>Last commit</span>
        <SortHeader sort="recent" className="justify-end">When</SortHeader>
      </div>
      <div ref={containerRef} className="nexis-scrollbar min-h-0 flex-1 overflow-y-auto">
        {rows.map((repo) => (
          <RepoRow
            key={repo.path}
            repo={repo}
            prs={prsFor(repo, prs)}
            selected={repo.path === selectedPath}
          />
        ))}
        {rows.length === 0 && attentionOnly && (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-ui text-muted-foreground">
            <span className="text-success/80">Nothing needs attention.</span>
            <button
              type="button"
              onClick={toggleAttentionOnly}
              className="hover:text-foreground"
            >
              Show all {repos.length} repositories
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** A column title that sorts by it. Every sort but the name is "most first". */
function SortHeader({
  sort,
  className,
  title,
  children,
}: {
  sort: ListSort;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const active = useAtlasStore((s) => s.listSort === sort);
  const setListSort = useAtlasStore((s) => s.setListSort);
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={() => setListSort(sort)}
      className={cn(
        "flex items-center gap-0.5 text-left transition-colors hover:text-foreground",
        active && "text-foreground",
        className,
      )}
    >
      {children}
      {active && (
        <Icon name={sort === "name" ? "chevron-up" : "chevron-down"} size="xs" />
      )}
    </button>
  );
}

function RepoRow({
  repo,
  prs,
  selected,
}: {
  repo: RepoSummary;
  prs: PrCounts | null;
  selected: boolean;
}) {
  const select = useAtlasStore((s) => s.select);
  const toggleDetail = useAtlasStore((s) => s.toggleDetail);
  const state = repoState(repo);
  const meta = STATE_META[state];

  return (
    <div
      role="row"
      tabIndex={-1}
      aria-selected={selected}
      data-selected={selected || undefined}
      onClick={() => select(repo.path)}
      onDoubleClick={() => void toggleDetail()}
      className={cn(
        GRID,
        "relative cursor-pointer px-4 py-2 text-sm transition-colors select-none",
        selected ? "bg-muted text-foreground" : "hover:bg-muted/60",
      )}
    >

      <span className="flex min-w-0 items-center gap-2">
        <span
          className={cn("size-2 shrink-0 rounded-full", meta.dot)}
          title={meta.label}
        />
        <span className="truncate font-medium">{repo.name}</span>
      </span>

      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        <Icon name="git-branch" size="sm" className="shrink-0" />
        <span className="truncate font-mono text-ui">
          {repo.branch || "–"}
          {repo.detached && " (detached)"}
        </span>
      </span>

      <SyncCell repo={repo} />

      <ChangesCell repo={repo} />

      <HealthCell repo={repo} prs={prs} />

      <span className="truncate text-muted-foreground">
        {repo.error ? (
          <span className="text-destructive">{repo.error}</span>
        ) : (
          (repo.last_commit?.summary ?? "no commits yet")
        )}
      </span>

      <span className="text-right text-ui text-muted-foreground tabular-nums">
        {repo.last_commit ? relativeTime(repo.last_commit.time) : ""}
      </span>
    </div>
  );
}

function SyncCell({ repo }: { repo: RepoSummary }) {
  if (repo.error) return <span />;
  if (!repo.upstream)
    return <span className="text-ui text-muted-foreground/60">no remote</span>;
  if (repo.ahead === 0 && repo.behind === 0)
    return <span className="text-ui text-muted-foreground/60">synced</span>;
  return (
    <span className="flex items-center gap-1.5 text-ui tabular-nums">
      {repo.ahead > 0 && (
        <span className="flex items-center text-info">
          <Icon name="chevron-up" size="xs" />
          {repo.ahead}
        </span>
      )}
      {repo.behind > 0 && (
        <span className="flex items-center text-warning">
          <Icon name="chevron-down" size="xs" />
          {repo.behind}
        </span>
      )}
    </span>
  );
}

function ChangesCell({ repo }: { repo: RepoSummary }) {
  if (repo.error) return <span />;
  const parts: { n: number; code: string; cls: string }[] = [
    { n: repo.staged, code: "staged", cls: "text-success" },
    { n: repo.unstaged, code: "modified", cls: "text-warning" },
    { n: repo.untracked, code: "untracked", cls: "text-muted-foreground" },
    { n: repo.conflicted, code: "conflicts", cls: "text-destructive" },
  ].filter((p) => p.n > 0);
  const stashes =
    repo.stash_count > 0 ? (
      <span
        className="text-muted-foreground/70"
        title={`${repo.stash_count} stashed`}
      >
        {repo.stash_count}≡
      </span>
    ) : null;
  if (parts.length === 0)
    return (
      <span className="flex items-center gap-1.5 text-ui tabular-nums">
        <span className="text-success/80">clean</span>
        {stashes}
      </span>
    );
  return (
    <span className="flex items-center gap-1.5 text-ui tabular-nums">
      {parts.map((p) => (
        <span key={p.code} className={p.cls} title={`${p.n} ${p.code}`}>
          {p.n}
          {p.code === "untracked" ? "?" : p.code === "conflicts" ? "!" : p.code[0].toUpperCase()}
        </span>
      ))}
      {stashes}
    </span>
  );
}

/** Leftovers a status pass can't see: stale branches, linked worktrees and
 *  open PRs. Each badge carries its full breakdown in a tooltip; the drill-in
 *  lists the branch names. Empty when there is nothing to tidy, so a clean
 *  column reads as clean at a glance. */
function HealthCell({ repo, prs }: { repo: RepoSummary; prs: PrCounts | null }) {
  if (repo.error) return <span />;
  const h = repo.health;
  const stale = staleBranchCount(repo);
  const branchTitle = [
    h.merged_branches.length > 0 && `${h.merged_branches.length} merged`,
    h.gone_branches.length > 0 && `${h.gone_branches.length} upstream gone`,
    h.inactive_branches.length > 0 && `${h.inactive_branches.length} inactive`,
  ]
    .filter(Boolean)
    .join(", ");
  const showPrs = prs !== null && prs.total > 0;
  if (stale === 0 && h.worktrees === 0 && !showPrs) {
    return <span className="text-ui text-muted-foreground/40">–</span>;
  }
  return (
    <span className="flex min-w-0 items-center gap-1 overflow-hidden">
      {stale > 0 && (
        <Badge variant="warning" title={`Stale branches: ${branchTitle}`}>
          <Icon name="git-branch" size="xs" />
          {stale}
        </Badge>
      )}
      {h.worktrees > 0 && (
        <Badge
          variant="secondary"
          title={`${h.worktrees} linked worktree${h.worktrees === 1 ? "" : "s"}`}
        >
          <Icon name="layers" size="xs" />
          {h.worktrees}
        </Badge>
      )}
      {showPrs && (
        <Badge
          variant="info"
          title={`${prs.total} open PR${prs.total === 1 ? "" : "s"}: ${prs.human} human, ${prs.dependabot} Dependabot`}
        >
          <Icon name="git-pr" size="xs" />
          {prs.human > 0 ? prs.human : null}
          {prs.dependabot > 0 && (
            <span className="flex items-center gap-0.5 opacity-70">
              {prs.human > 0 && "+"}
              <Icon name="agent" size="xs" />
              {prs.dependabot}
            </span>
          )}
        </Badge>
      )}
    </span>
  );
}
