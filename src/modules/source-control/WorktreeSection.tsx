// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * WorktreeSection — manage git worktrees from the source control panel.
 *
 * Shows all worktrees (linked + main), lets the user add a new worktree
 * (pointing to an existing or new branch) and remove linked ones.
 * Uses the `git_worktree_*` Tauri commands added in v1.10.0.
 */
import { basename } from "@/lib/path";
import { cn } from "@/lib/utils";
import {
  Add01Icon,
  Cancel01Icon,
  Delete01Icon,
  FolderTreeIcon,
  Refresh01Icon,
  Tick01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";

type GitWorktreeEntry = {
  path: string;
  sha: string;
  branch: string;
  isMain: boolean;
  isDetached: boolean;
  isPrunable: boolean;
};

type Props = {
  repoRoot: string;
  /** Open the selected worktree path as a workspace */
  onOpenWorktree?: (path: string) => void;
};

export function WorktreeSection({ repoRoot, onOpenWorktree }: Props) {
  const [open, setOpen] = useState(false);
  const [worktrees, setWorktrees] = useState<GitWorktreeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addPath, setAddPath] = useState("");
  const [addBranch, setAddBranch] = useState("");
  const [addNewBranch, setAddNewBranch] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const pathRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!repoRoot) return;
    setLoading(true);
    setError(null);
    try {
      const list = await invoke<GitWorktreeEntry[]>("git_worktree_list", { repoRoot });
      setWorktrees(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [repoRoot]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const handleRemove = useCallback(
    async (path: string) => {
      try {
        await invoke("git_worktree_remove", { repoRoot, path });
        await load();
      } catch (e) {
        setError(String(e));
      }
    },
    [repoRoot, load],
  );

  const handleAdd = useCallback(async () => {
    const path = addPath.trim();
    const branch = addBranch.trim();
    if (!path || !branch) return;
    setAddBusy(true);
    try {
      await invoke("git_worktree_add", {
        repoRoot,
        path,
        branch,
        newBranch: addNewBranch,
      });
      setAdding(false);
      setAddPath("");
      setAddBranch("");
      setAddNewBranch(false);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setAddBusy(false);
    }
  }, [repoRoot, addPath, addBranch, addNewBranch, load]);

  const startAdding = useCallback(() => {
    setAdding(true);
    setTimeout(() => pathRef.current?.focus(), 40);
  }, []);

  return (
    <div className="border-t border-border/30">
      {/* Section header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/20"
      >
        <HugeiconsIcon
          icon={FolderTreeIcon}
          size={11}
          strokeWidth={1.75}
          className="shrink-0 text-muted-foreground/70"
        />
        <span className="flex-1 text-[11px] font-medium text-muted-foreground">Worktrees</span>
        {worktrees.length > 0 && (
          <span className="text-[10px] text-muted-foreground/50">{worktrees.length}</span>
        )}
        <span className="text-[10px] text-muted-foreground/40">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="pb-2">
          {/* List */}
          {loading ? (
            <p className="px-3 py-1 text-[10.5px] text-muted-foreground/50">Loading…</p>
          ) : worktrees.length === 0 ? (
            <p className="px-3 py-1 text-[10.5px] text-muted-foreground/50">No worktrees</p>
          ) : (
            worktrees.map((wt) => (
              <div
                key={wt.path}
                className={cn(
                  "group flex items-center gap-2 px-3 py-1.5 hover:bg-muted/20",
                )}
              >
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => onOpenWorktree?.(wt.path)}
                    disabled={!onOpenWorktree}
                    className="block truncate text-left text-[11px] text-foreground/80 hover:text-foreground disabled:cursor-default"
                    title={wt.path}
                  >
                    {basename(wt.path)}
                    {wt.isMain && (
                      <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold text-primary/70">
                        main
                      </span>
                    )}
                  </button>
                  <p className="truncate text-[9.5px] text-muted-foreground/50">
                    {wt.isDetached ? (
                      <span className="text-amber-500/70">detached {wt.sha}</span>
                    ) : (
                      <>
                        <span className="text-primary/60">{wt.branch}</span>
                        {" · "}
                        <span className="font-mono">{wt.sha}</span>
                      </>
                    )}
                    {wt.isPrunable && (
                      <span className="ml-1 text-red-500/70">(prunable)</span>
                    )}
                  </p>
                </div>

                {!wt.isMain && (
                  <button
                    type="button"
                    title="Remove worktree"
                    onClick={() => void handleRemove(wt.path)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                  >
                    <HugeiconsIcon icon={Delete01Icon} size={10} strokeWidth={1.75} />
                  </button>
                )}
              </div>
            ))
          )}

          {/* Add form */}
          {adding ? (
            <div className="mx-2 mt-1 space-y-1.5 rounded-md border border-border/40 bg-muted/10 p-2">
              <input
                ref={pathRef}
                value={addPath}
                onChange={(e) => setAddPath(e.target.value)}
                aria-label="Path for new worktree"
                placeholder="Path for new worktree"
                className="w-full rounded border border-border/60 bg-background/60 px-2 py-1 text-[11px] text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-primary/60"
              />
              <input
                value={addBranch}
                onChange={(e) => setAddBranch(e.target.value)}
                aria-label="Branch name"
                placeholder="Branch name"
                className="w-full rounded border border-border/60 bg-background/60 px-2 py-1 text-[11px] text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-primary/60"
              />
              <label className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={addNewBranch}
                  onChange={(e) => setAddNewBranch(e.target.checked)}
                  className="h-3 w-3 accent-primary"
                />
                Create new branch (-b)
              </label>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => void handleAdd()}
                  disabled={addBusy || !addPath.trim() || !addBranch.trim()}
                  className="flex flex-1 items-center justify-center gap-1 rounded bg-primary/90 py-1 text-[10.5px] font-medium text-primary-foreground hover:bg-primary disabled:opacity-40"
                >
                  <HugeiconsIcon icon={Tick01Icon} size={10} strokeWidth={2} />
                  {addBusy ? "Adding…" : "Add"}
                </button>
                <button
                  type="button"
                  aria-label="Cancel adding worktree"
                  onClick={() => setAdding(false)}
                  className="flex items-center justify-center gap-1 rounded border border-border/50 px-2 py-1 text-[10.5px] text-muted-foreground hover:bg-muted/40"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2} />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-1 px-3 pt-1">
              <button
                type="button"
                onClick={startAdding}
                className="flex items-center gap-1 text-[10.5px] text-muted-foreground/60 hover:text-foreground"
              >
                <HugeiconsIcon icon={Add01Icon} size={10} strokeWidth={2} />
                Add worktree
              </button>
              <button
                type="button"
                onClick={() => void load()}
                title="Refresh"
                className="ml-auto flex h-5 w-5 items-center justify-center rounded text-muted-foreground/40 hover:bg-muted/40 hover:text-muted-foreground"
              >
                <HugeiconsIcon icon={Refresh01Icon} size={10} strokeWidth={2} />
              </button>
            </div>
          )}

          {error && (
            <p className="mx-2 mt-1 rounded bg-destructive/10 px-2 py-1 text-[10.5px] text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
