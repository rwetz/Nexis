import { Icon } from "@/components/icon";
import { relativeTime } from "@/modules/atlas/lib/time";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useRef } from "react";
import { useAtlasStore } from "@/modules/atlas/repos/store";
import {
  displayOrder,
  repoState,
  STATE_META,
  type RepoSummary,
} from "@/modules/atlas/repos/types";

const GRID =
  "grid grid-cols-[minmax(150px,1.1fr)_minmax(110px,0.8fr)_86px_120px_minmax(180px,1.6fr)_80px] items-center gap-x-3";

export function RepoTable() {
  const repos = useAtlasStore((s) => s.repos);
  const selectedPath = useAtlasStore((s) => s.selectedPath);
  const containerRef = useRef<HTMLDivElement>(null);

  // The backend orders repos biggest-first for the map's treemap; a table
  // wants them alphabetical. `moveSelection` walks this same order.
  const rows = useMemo(() => displayOrder(repos, "list"), [repos]);

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
          "shrink-0 border-b border-border/60 px-4 py-2 text-xs font-medium text-muted-foreground select-none",
        )}
      >
        <span className="pl-5">Repository</span>
        <span>Branch</span>
        <span>Sync</span>
        <span>Changes</span>
        <span>Last commit</span>
        <span className="text-right">When</span>
      </div>
      <div ref={containerRef} className="nexis-scrollbar min-h-0 flex-1 overflow-y-auto">
        {rows.map((repo) => (
          <RepoRow key={repo.path} repo={repo} selected={repo.path === selectedPath} />
        ))}
      </div>
    </div>
  );
}

function RepoRow({ repo, selected }: { repo: RepoSummary; selected: boolean }) {
  const select = useAtlasStore((s) => s.select);
  const toggleDetail = useAtlasStore((s) => s.toggleDetail);
  const state = repoState(repo);
  const meta = STATE_META[state];

  return (
    <div
      role="row"
      data-selected={selected || undefined}
      onClick={() => select(repo.path)}
      onDoubleClick={() => void toggleDetail()}
      className={cn(
        GRID,
        "relative cursor-pointer px-4 py-2 text-sm transition-colors select-none",
        selected ? "bg-accent" : "hover:bg-accent/50",
      )}
    >
      {/* Selected-row indicator — the brand accent marks active state. */}
      {selected && (
        <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-brand" />
      )}

      <span className="flex min-w-0 items-center gap-2">
        <span
          className={cn("size-2 shrink-0 rounded-full", meta.dot)}
          title={meta.label}
        />
        <span className="truncate font-medium">{repo.name}</span>
      </span>

      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        <Icon name="git-branch" size="sm" className="shrink-0" />
        <span className="truncate font-mono text-xs">
          {repo.branch || "—"}
          {repo.detached && " (detached)"}
        </span>
      </span>

      <SyncCell repo={repo} />

      <ChangesCell repo={repo} />

      <span className="truncate text-muted-foreground">
        {repo.error ? (
          <span className="text-destructive">{repo.error}</span>
        ) : (
          (repo.last_commit?.summary ?? "no commits yet")
        )}
      </span>

      <span className="text-right text-xs text-muted-foreground tabular-nums">
        {repo.last_commit ? relativeTime(repo.last_commit.time) : ""}
      </span>
    </div>
  );
}

function SyncCell({ repo }: { repo: RepoSummary }) {
  if (repo.error) return <span />;
  if (!repo.upstream)
    return <span className="text-xs text-muted-foreground/60">no remote</span>;
  if (repo.ahead === 0 && repo.behind === 0)
    return <span className="text-xs text-muted-foreground/60">synced</span>;
  return (
    <span className="flex items-center gap-1.5 font-mono text-xs tabular-nums">
      {repo.ahead > 0 && (
        <span className="flex items-center text-sky-400">
          <Icon name="chevron-up" size="xs" />
          {repo.ahead}
        </span>
      )}
      {repo.behind > 0 && (
        <span className="flex items-center text-orange-400">
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
    { n: repo.staged, code: "staged", cls: "text-emerald-500" },
    { n: repo.unstaged, code: "modified", cls: "text-amber-400" },
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
      <span className="flex items-center gap-1.5 font-mono text-xs tabular-nums">
        <span className="text-emerald-500/80">clean</span>
        {stashes}
      </span>
    );
  return (
    <span className="flex items-center gap-1.5 font-mono text-xs tabular-nums">
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
