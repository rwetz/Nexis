import { cn } from "@/lib/utils";
import {
  useRecentWorkspaces,
  workspaceBasename,
} from "@/modules/workspace/useRecentWorkspaces";
import { FolderOpenIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Props = {
  currentPath: string | null;
  onSelect: (path: string) => void;
  onClose: () => void;
};

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function WorkspaceSwitcher({ currentPath, onSelect, onClose }: Props) {
  const workspaces = useRecentWorkspaces((s) => s.workspaces);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const normalizedCurrent = currentPath?.replace(/\\/g, "/") ?? null;

  const filtered = useMemo(() => {
    if (!query.trim()) return workspaces;
    const q = query.trim().toLowerCase();
    return workspaces.filter(
      (w) =>
        w.path.toLowerCase().includes(q) ||
        workspaceBasename(w.path).toLowerCase().includes(q),
    );
  }, [workspaces, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const commit = useCallback(
    (path: string) => {
      onSelect(path);
      onClose();
    },
    [onSelect, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = filtered[activeIndex];
        if (item) commit(item.path);
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [filtered, activeIndex, commit, onClose],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex w-[520px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border/60 bg-popover shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2.5">
          <HugeiconsIcon
            icon={FolderOpenIcon}
            size={14}
            strokeWidth={1.75}
            className="shrink-0 text-muted-foreground"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Switch workspace…"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60"
          />
        </div>

        <div className="max-h-[360px] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-8 text-center text-[12px] text-muted-foreground">
              {query ? "No matching workspaces" : "No recent workspaces"}
            </div>
          ) : (
            filtered.map((ws, i) => {
              const name = workspaceBasename(ws.path);
              const isCurrent = ws.path === normalizedCurrent;
              return (
                <button
                  key={ws.path}
                  type="button"
                  onClick={() => commit(ws.path)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                    i === activeIndex
                      ? "bg-accent text-foreground"
                      : "hover:bg-accent/50",
                  )}
                >
                  <HugeiconsIcon
                    icon={FolderOpenIcon}
                    size={14}
                    strokeWidth={1.75}
                    className={cn(
                      "shrink-0",
                      isCurrent ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[12.5px] font-medium leading-snug">
                        {name}
                      </span>
                      {isCurrent && (
                        <span className="shrink-0 rounded-sm bg-primary/15 px-1 py-px text-[9.5px] font-medium text-primary">
                          current
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[10.5px] text-muted-foreground/70">
                      {ws.path}
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/50">
                    {relativeTime(ws.lastUsed)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
