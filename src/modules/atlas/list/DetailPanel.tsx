import { Icon, type IconName } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { absoluteTime, relativeTime } from "@/modules/atlas/lib/time";
import { cn } from "@/lib/utils";
import { revealPath } from "@/modules/atlas/repos/api";
import { useAtlasHost } from "@/modules/atlas/repos/host";
import { useAtlasStore } from "@/modules/atlas/repos/store";
import {
  repoState,
  STATE_META,
  type FileChange,
  type RepoDetail,
  type RepoSummary,
} from "@/modules/atlas/repos/types";
import { toast } from "sonner";

export function DetailPanel() {
  const detailOpen = useAtlasStore((s) => s.detailOpen);
  const detail = useAtlasStore((s) => s.detail);
  const detailLoading = useAtlasStore((s) => s.detailLoading);
  const closeDetail = useAtlasStore((s) => s.closeDetail);
  // The summary is already in the store from the scan — the backend does not
  // send it a second time with the detail.
  const summary = useAtlasStore(
    (s) => s.repos.find((r) => r.path === s.selectedPath) ?? null,
  );

  if (!detailOpen) return null;

  // Was a `motion/react` spring from the standalone app's design package.
  // Nexis animates in CSS with the house motion tokens, so this is the same
  // movement without pulling an animation library in for one panel. The exit
  // animation goes with it -- `AnimatePresence` is what made that possible,
  // and a pane that leaves immediately is the lesser loss.
  return (
    <aside className="nexis-slide-in-right flex h-full w-[380px] shrink-0 flex-col border-l border-border/60 bg-card">
      {summary && detail ? (
        <DetailBody summary={summary} detail={detail} onClose={closeDetail} />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {detailLoading ? "Loading…" : "No repo selected"}
        </div>
      )}
    </aside>
  );
}

function DetailBody({
  summary,
  detail,
  onClose,
}: {
  summary: RepoSummary;
  detail: RepoDetail;
  onClose: () => void;
}) {
  const { files, stashes } = detail;
  const enterRepo = useAtlasStore((s) => s.enterRepo);
  const meta = STATE_META[repoState(summary)];
  const host = useAtlasHost();

  const handleTerminal = () => host.openTerminal(summary.path);
  const handleFolder = () => {
    revealPath(summary.path).catch((e) =>
      toast.error("Could not reveal folder", { description: String(e) }),
    );
  };
  // Was "Open in Nexis", which spawned a second copy of the app. Now it points
  // this window at the repo, so there is nothing to detect and nothing to hide:
  // the action always works.
  const handleOpenWorkspace = () => host.openWorkspace(summary.path);

  return (
    <>
      <header className="flex items-start gap-2 border-b border-border/60 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("size-2 shrink-0 rounded-full", meta.dot)} />
            <h2 className="truncate font-heading text-base font-semibold">
              {summary.name}
            </h2>
            <span className={cn("text-xs", meta.text)}>{meta.label}</span>
          </div>
          <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
            {summary.path}
          </p>
        </div>
        <Button variant="ghost" size="icon-xs" aria-label="Close details" onClick={onClose}>
          <Icon name="close" size="sm" />
        </Button>
      </header>

      <div className="nexis-scrollbar min-h-0 flex-1 overflow-y-auto p-4 pt-3">
        <section className="space-y-1.5 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Icon name="git-branch" size="sm" />
            <span className="font-mono text-xs">
              {summary.branch}
              {summary.detached && " (detached)"}
              {summary.upstream && (
                <span className="text-muted-foreground/60"> → {summary.upstream}</span>
              )}
            </span>
          </div>
          {summary.upstream && (summary.ahead > 0 || summary.behind > 0) && (
            <p className="text-xs text-muted-foreground">
              {summary.ahead > 0 && (
                <span className="text-sky-400">{summary.ahead} ahead</span>
              )}
              {summary.ahead > 0 && summary.behind > 0 && " · "}
              {summary.behind > 0 && (
                <span className="text-orange-400">{summary.behind} behind</span>
              )}
            </p>
          )}
        </section>

        {summary.last_commit && (
          <section className="mt-4">
            <SectionTitle icon="git-commit">Last commit</SectionTitle>
            <div className="mt-1.5 rounded-xl border border-border/60 bg-background/60 p-3">
              <p className="text-sm">{summary.last_commit.summary}</p>
              <p className="mt-1.5 font-mono text-xs text-muted-foreground">
                {summary.last_commit.hash} · {summary.last_commit.author}
              </p>
              <p
                className="mt-0.5 text-xs text-muted-foreground"
                title={absoluteTime(summary.last_commit.time)}
              >
                {relativeTime(summary.last_commit.time)}
              </p>
            </div>
          </section>
        )}

        <section className="mt-4">
          <SectionTitle icon="git-branch">
            Changed files{files.length > 0 && ` (${files.length})`}
          </SectionTitle>
          {files.length === 0 ? (
            <p className="mt-1.5 text-xs text-emerald-500/80">Working tree clean</p>
          ) : (
            <ul className="mt-1.5 space-y-0.5">
              {files.map((f) => (
                <FileRow key={f.path} file={f} />
              ))}
            </ul>
          )}
        </section>

        <section className="mt-4">
          <SectionTitle icon="archive">
            Stashes{stashes.length > 0 && ` (${stashes.length})`}
          </SectionTitle>
          {stashes.length === 0 ? (
            <p className="mt-1.5 text-xs text-muted-foreground">None</p>
          ) : (
            <ul className="mt-1.5 space-y-0.5">
              {stashes.map((msg, i) => (
                <li key={i} className="truncate font-mono text-xs text-muted-foreground">
                  stash@{"{"}
                  {i}
                  {"}"}: {msg}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="flex flex-col gap-2 border-t border-border/60 p-3">
        {/* The jump the merge exists for: the same repo, as a city. */}
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void enterRepo(summary.path)}
        >
          <Icon name="globe" size="sm" />
          Show on map
        </Button>
        <Button size="sm" variant="secondary" onClick={handleOpenWorkspace}>
          <Icon name="folder-open" size="sm" />
          Open as workspace
        </Button>
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={handleTerminal}>
            <Icon name="terminal" size="sm" />
            Terminal
          </Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={handleFolder}>
            <Icon name="folder-open" size="sm" />
            Folder
          </Button>
        </div>
      </footer>
    </>
  );
}

function SectionTitle({
  icon,
  children,
}: {
  icon: IconName;
  children: React.ReactNode;
}) {
  return (
    <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <Icon name={icon} size="xs" />
      {children}
    </h3>
  );
}

function FileRow({ file }: { file: FileChange }) {
  return (
    <li className="flex items-center gap-2 font-mono text-xs">
      <span className="w-6 shrink-0 text-right tabular-nums">
        {file.conflicted ? (
          <span className="text-destructive">!!</span>
        ) : (
          <>
            <span className="text-emerald-500">{file.index ?? " "}</span>
            <span className="text-amber-400">{file.worktree ?? " "}</span>
          </>
        )}
      </span>
      <span className="truncate text-foreground/90">{file.path}</span>
    </li>
  );
}

