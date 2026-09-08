import { Button } from "@/components/ui/button";
import { spring } from "@/lib/motion";
import { absoluteTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { openInTerminal, openPath } from "@/modules/repos/api";
import { useAtlasStore } from "@/modules/repos/store";
import {
  repoState,
  STATE_META,
  type FileChange,
  type RepoDetail,
  type RepoSummary,
} from "@/modules/repos/types";
import {
  Archive02Icon,
  Cancel01Icon,
  ComputerTerminal01Icon,
  FolderOpenIcon,
  GitBranchIcon,
  GitCommitIcon,
  MapsGlobal01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
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

  return (
    <AnimatePresence>
      {detailOpen && (
        <motion.aside
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 40, opacity: 0 }}
          transition={spring.smooth}
          className="flex h-full w-[380px] shrink-0 flex-col border-l border-border/60 bg-card"
        >
          {summary && detail ? (
            <DetailBody summary={summary} detail={detail} onClose={closeDetail} />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {detailLoading ? "Loading…" : "No repo selected"}
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
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

  const handleTerminal = () => {
    openInTerminal(summary.path)
      .then((term) => toast.success(`Opened ${term} at ${summary.name}`))
      .catch((e) => toast.error("Could not open terminal", { description: String(e) }));
  };
  const handleFolder = () => {
    openPath(summary.path).catch((e) =>
      toast.error("Could not open folder", { description: String(e) }),
    );
  };

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
          <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
        </Button>
      </header>

      <div className="nexis-scrollbar min-h-0 flex-1 overflow-y-auto p-4 pt-3">
        <section className="space-y-1.5 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <HugeiconsIcon icon={GitBranchIcon} size={14} strokeWidth={2} />
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
            <SectionTitle icon={GitCommitIcon}>Last commit</SectionTitle>
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
          <SectionTitle icon={GitBranchIcon}>
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
          <SectionTitle icon={Archive02Icon}>
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
          <HugeiconsIcon icon={MapsGlobal01Icon} size={14} strokeWidth={2} />
          Show on map
        </Button>
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={handleTerminal}>
            <HugeiconsIcon icon={ComputerTerminal01Icon} size={14} strokeWidth={2} />
            Terminal
          </Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={handleFolder}>
            <HugeiconsIcon icon={FolderOpenIcon} size={14} strokeWidth={2} />
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
  icon: typeof GitBranchIcon;
  children: React.ReactNode;
}) {
  return (
    <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <HugeiconsIcon icon={icon} size={13} strokeWidth={2} />
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
