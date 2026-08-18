// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { native } from "@/modules/ai/lib/native";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";

type BumpKind = "patch" | "minor" | "major";

type Props = {
  workspaceRoot: string | null;
};

function bumpVersion(version: string, kind: BumpKind): string {
  const parts = version.replace(/^v/, "").split(".").map(Number);
  const [maj, min, pat] = [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  if (kind === "major") return `${maj + 1}.0.0`;
  if (kind === "minor") return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

function parseCommits(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const colonIdx = l.indexOf(":");
      if (colonIdx === -1) return `- ${l}`;
      const type = l.slice(0, colonIdx).replace(/\(.*\)/, "").trim();
      const rest = l.slice(colonIdx + 1).trim();
      return `- **${type}**: ${rest}`;
    });
}

export function ReleasePanel({ workspaceRoot }: Props) {
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [lastTag, setLastTag] = useState<string | null>(null);
  const [commits, setCommits] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tagStatus, setTagStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [tagError, setTagError] = useState<string | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!workspaceRoot) return;
    setLoading(true);
    try {
      const [pkgResult, tagResult] = await Promise.allSettled([
        native.runCommand("node -e \"process.stdout.write(require('./package.json').version)\"", workspaceRoot, 5),
        native.runCommand("git describe --tags --abbrev=0", workspaceRoot, 5),
      ]);

      const ver = pkgResult.status === "fulfilled" ? pkgResult.value.stdout.trim() : null;
      const tag = tagResult.status === "fulfilled" ? tagResult.value.stdout.trim() : null;
      setCurrentVersion(ver);
      setLastTag(tag);

      if (tag) {
        const logResult = await native.runCommand(
          `git log ${tag}..HEAD --pretty=format:"%s" --no-merges`,
          workspaceRoot,
          10,
        );
        setCommits(parseCommits(logResult.stdout));
      } else {
        const logResult = await native.runCommand(
          `git log --pretty=format:"%s" --no-merges -20`,
          workspaceRoot,
          10,
        );
        setCommits(parseCommits(logResult.stdout));
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [workspaceRoot]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const nextVersion = (kind: BumpKind) =>
    currentVersion ? bumpVersion(currentVersion, kind) : null;

  const changelogEntry = useCallback(
    (version: string) => {
      const date = new Date().toISOString().slice(0, 10);
      const lines = [
        `## [${version}] — ${date}`,
        "",
        "### Added",
        ...commits,
        "",
      ];
      return lines.join("\n");
    },
    [commits],
  );

  const copyChangelog = useCallback(
    (version: string) => {
      void navigator.clipboard.writeText(changelogEntry(version));
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
    },
    [changelogEntry],
  );

  const createTag = useCallback(
    async (version: string) => {
      if (!workspaceRoot) return;
      setTagStatus("running");
      setTagError(null);
      try {
        await native.runCommand(`git tag v${version} -m "Release v${version}"`, workspaceRoot, 10);
        setTagStatus("done");
        void refresh();
      } catch (err) {
        setTagError(String(err));
        setTagStatus("error");
      }
    },
    [workspaceRoot, refresh],
  );

  if (!workspaceRoot) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No workspace open.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Release Tooling
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={() => void refresh()}
          disabled={loading}
          title="Refresh"
        >
          <Icon name="source" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Current version</p>
          <div className="flex items-center gap-2">
            <Icon name="tag" className="text-muted-foreground/60" />
            <span className="font-mono text-sm font-semibold text-foreground">
              {loading ? "…" : (currentVersion ?? "unknown")}
            </span>
            {lastTag && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Icon name="git-branch" size="xs" />
                last tag: {lastTag}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Bump version</p>
          <div className="grid grid-cols-3 gap-1.5">
            {(["patch", "minor", "major"] as BumpKind[]).map((kind) => {
              const next = nextVersion(kind);
              return (
                <div key={kind} className="flex flex-col gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs w-full"
                    disabled={!next || loading}
                    onClick={() => next && copyChangelog(next)}
                  >
                    {kind}
                  </Button>
                  <span className="text-center font-mono text-[10px] text-muted-foreground">
                    {next ?? "…"}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Click a bump type to copy its changelog entry to clipboard.
          </p>
          {copied && (
            <p className="flex items-center gap-1 text-[10px] text-green-500">
              <Icon name="success" size="xs" />
              Copied to clipboard
            </p>
          )}
        </div>

        {commits.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Changes since {lastTag ?? "beginning"}
              </p>
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5"
                title="Copy changelog"
                onClick={() => currentVersion && copyChangelog(currentVersion)}
              >
                <Icon name="copy" size="xs" />
              </Button>
            </div>
            <ul className="space-y-0.5">
              {commits.map((c, i) => (
                <li key={i} className="text-[11px] text-foreground/80 leading-relaxed font-mono">
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}
        {commits.length === 0 && !loading && (
          <p className="text-xs text-muted-foreground">No commits since last tag.</p>
        )}

        <div className="space-y-1.5 border-t border-border/30 pt-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Create git tag</p>
          <div className="grid grid-cols-3 gap-1.5">
            {(["patch", "minor", "major"] as BumpKind[]).map((kind) => {
              const next = nextVersion(kind);
              return (
                <Button
                  key={kind}
                  size="sm"
                  variant="outline"
                  className={cn("h-7 text-xs", tagStatus === "done" && "border-green-500/50 text-green-600 dark:text-green-400")}
                  disabled={!next || loading || tagStatus === "running"}
                  onClick={() => next && void createTag(next)}
                >
                  tag v{next ?? "…"}
                </Button>
              );
            })}
          </div>
          {tagStatus === "done" && (
            <p className="flex items-center gap-1 text-[10px] text-green-500">
              <Icon name="success" size="xs" />
              Tag created successfully
            </p>
          )}
          {tagStatus === "error" && tagError && (
            <p className="text-[10px] text-destructive">{tagError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
