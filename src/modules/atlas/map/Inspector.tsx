import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { revealPath } from "@/modules/atlas/repos/api";
import { useAtlasHost } from "@/modules/atlas/repos/host";
import type { Block } from "./layout";
import { loc } from "./layout";
import { useAtlasStore } from "@/modules/atlas/repos/store";
import {
  dirtyCount,
  formatBytes,
  formatCount,
  relativeTime,
  statusLabel,
} from "@/modules/atlas/repos/types";

/** Right-hand pane. Shows whatever the pointer is over, falling back to the
 *  last click, so the city can be read without ever taking your hand off the
 *  mouse. */
export function Inspector() {
  const hover = useAtlasStore((s) => s.hover);
  const selected = useAtlasStore((s) => s.selectedBlock);
  const city = useAtlasStore((s) => s.city);
  const view = useAtlasStore((s) => s.mapView);
  const subject = hover ?? selected;

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-border/60 bg-card">
      <div className="flex h-9 shrink-0 items-center border-b border-border/60 px-3">
        <span className="text-xs font-medium text-muted-foreground">
          {hover ? "Under cursor" : selected ? "Selected" : "Inspector"}
        </span>
      </div>
      <div className="nexis-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
        {subject ? (
          <BlockDetail block={subject} repoPath={city?.summary.path ?? null} />
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {view === "atlas"
              ? "Each plot is a repository; the towers on it are its languages, sized by how much code each holds. Double-click a plot to walk into it."
              : "Terraces are directories, buildings are files. Height is lines of code, colour is language, a coral edge means the working tree has changed it."}
          </p>
        )}
      </div>
    </aside>
  );
}

function BlockDetail({ block, repoPath }: { block: Block; repoPath: string | null }) {
  const ref = block.ref;

  if (ref.kind === "repo" || ref.kind === "district") {
    const repo = ref.repo;
    const dirty = dirtyCount(repo);
    return (
      <div className="flex flex-col gap-3">
        <Title
          name={ref.kind === "district" ? ref.slice.lang : repo.name}
          sub={ref.kind === "district" ? `in ${repo.name}` : repo.path}
        />
        {ref.kind === "district" ? (
          <Rows
            rows={[
              ["Files", formatCount(ref.slice.files)],
              ["Size", formatBytes(ref.slice.bytes)],
              ["Share", `${((ref.slice.bytes / Math.max(1, repo.bytes)) * 100).toFixed(1)}%`],
            ]}
          />
        ) : (
          <Rows
            rows={[
              ["Branch", repo.branch || "—"],
              ["Files", formatCount(repo.files)],
              ["Directories", formatCount(repo.dirs)],
              ["Size", formatBytes(repo.bytes)],
              ["Uncommitted", dirty === 0 ? "clean" : formatCount(dirty)],
              ["Ahead / behind", `${repo.ahead} / ${repo.behind}`],
              ["Last commit", relativeTime(repo.last_commit?.time ?? null)],
            ]}
          />
        )}
        {repo.last_commit?.summary && (
          <p className="border-l-2 border-border pl-2 text-xs leading-relaxed text-muted-foreground">
            {repo.last_commit?.summary}
          </p>
        )}
        {repo.langs.length > 0 && <LangBars repo={repo} />}
        <Actions path={repo.path} withTerminal />
      </div>
    );
  }

  const node = ref.node;
  const absolute = repoPath ? `${repoPath}/${node.path}` : node.path;
  const status = statusLabel(node.status);

  return (
    <div className="flex flex-col gap-3">
      <Title name={node.name} sub={node.path || "/"} />
      <Rows
        rows={
          node.is_dir
            ? [
                ["Kind", "directory"],
                ["Entries", formatCount(node.children.length)],
                ["Lines", formatCount(node.lines)],
                ["Size", formatBytes(node.bytes)],
                ["Mostly", node.lang],
                ["Changed files", node.dirty === 0 ? "none" : formatCount(node.dirty)],
              ]
            : [
                ["Kind", node.lang],
                [
                  "Lines",
                  node.lines > 0 ? formatCount(node.lines) : `~${formatCount(Math.round(loc(node)))} est.`,
                ],
                ["Size", formatBytes(node.bytes)],
                ["Working tree", status ?? "clean"],
              ]
        }
        accent={status ? "Working tree" : undefined}
      />
      <Actions path={absolute} />
    </div>
  );
}

function Title({ name, sub }: { name: string; sub: string }) {
  return (
    <div className="min-w-0">
      <h2 className="truncate font-heading text-sm font-semibold" title={name}>
        {name}
      </h2>
      <p className="truncate font-mono text-[11px] text-muted-foreground" title={sub}>
        {sub}
      </p>
    </div>
  );
}

function Rows({
  rows,
  accent,
}: {
  rows: [string, string][];
  accent?: string;
}) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      {rows.map(([label, value]) => (
        <div key={label} className="col-span-2 flex items-baseline justify-between gap-3">
          <dt className="shrink-0 text-muted-foreground">{label}</dt>
          <dd
            className={cn(
              "truncate text-right tabular-nums",
              accent === label && "font-medium text-[var(--brand)]",
            )}
            title={value}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function LangBars({ repo }: { repo: { langs: { lang: string; bytes: number }[]; bytes: number } }) {
  const total = Math.max(1, repo.bytes);
  return (
    <div className="flex flex-col gap-1">
      {repo.langs.slice(0, 6).map((slice) => {
        const pct = (slice.bytes / total) * 100;
        return (
          <div key={slice.lang} className="flex items-center gap-2 text-[11px]">
            <span className="w-20 shrink-0 truncate text-muted-foreground">
              {slice.lang}
            </span>
            <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-muted-foreground/70"
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </span>
            <span className="w-9 shrink-0 text-right tabular-nums text-muted-foreground/70">
              {pct.toFixed(0)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Actions({ path, withTerminal }: { path: string; withTerminal?: boolean }) {
  const enterRepo = useAtlasStore((s) => s.enterRepo);
  const view = useAtlasStore((s) => s.mapView);
  const host = useAtlasHost();

  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {withTerminal && view === "atlas" && (
        <Button size="xs" variant="outline" onClick={() => void enterRepo(path)}>
          <Icon name="chevron-right" size="xs" />
          Enter
        </Button>
      )}
      <Button
        size="xs"
        variant="outline"
        onClick={() =>
          revealPath(path).catch((e) =>
            toast.error("Could not reveal", { description: String(e) }),
          )
        }
      >
        <Icon name="folder-open" size="xs" />
        Open
      </Button>
      {withTerminal && (
        <Button
          size="xs"
          variant="outline"
          onClick={() => host.openTerminal(path)}
        >
          <Icon name="terminal" size="xs" />
          Terminal
        </Button>
      )}
      {withTerminal && (
        <Button
          size="xs"
          variant="outline"
          onClick={() => host.openWorkspace(path)}
        >
          <Icon name="folder-open" size="xs" />
          Workspace
        </Button>
      )}
    </div>
  );
}
