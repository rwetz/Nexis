import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";

type SearchHit = {
  path: string;
  rel: string;
  name: string;
  is_dir: boolean;
};

type ListFilesResult = {
  files: string[];
  truncated: boolean;
};

type Props = {
  root: string | null;
  onSelect: (path: string) => void;
  onClose: () => void;
};

function basename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function dirname(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx > 0 ? normalized.slice(0, idx) : "";
}

export function QuickFilePicker({ root, onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [allFiles, setAllFiles] = useState<string[]>([]);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Load all files when root changes (or on open).
  useEffect(() => {
    if (!root) return;
    setLoading(true);
    invoke<ListFilesResult>("fs_list_files", {
      root,
      limit: 3000,
      maxDepth: 10,
      showHidden: false,
    })
      .then((res) => {
        setAllFiles(res.files);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [root]);

  // Filter files when query changes.
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      const top = allFiles.slice(0, 50).map((rel) => ({
        path: root ? `${root}/${rel}` : rel,
        rel,
        name: basename(rel),
        is_dir: false,
      }));
      setHits(top);
      setActiveIdx(0);
      return;
    }

    if (!root) return;

    // Quick local filter for speed; fall back to backend for large repos.
    const localHits = allFiles
      .filter((rel) => rel.toLowerCase().includes(q))
      .slice(0, 100)
      .map((rel) => ({
        path: `${root}/${rel}`,
        rel,
        name: basename(rel),
        is_dir: false,
      }));

    // Sort: filename matches first, then by path length.
    localHits.sort((a, b) => {
      const an = a.name.toLowerCase().includes(q);
      const bn = b.name.toLowerCase().includes(q);
      return (bn ? 1 : 0) - (an ? 1 : 0) || a.rel.length - b.rel.length;
    });

    setHits(localHits.slice(0, 50));
    setActiveIdx(0);
  }, [query, allFiles, root]);

  // Scroll active item into view.
  useEffect(() => {
    const item = listRef.current?.children[activeIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const commit = (idx: number) => {
    const hit = hits[idx];
    if (hit) {
      onSelect(hit.path);
      onClose();
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, hits.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      commit(activeIdx);
      return;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative z-10 flex w-[560px] max-w-[90vw] flex-col overflow-hidden rounded-xl border border-border/60 bg-background shadow-2xl">
        {/* Input */}
        <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2.5">
          <svg
            className="size-4 shrink-0 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.75}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Go to file…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60"
          />
          {loading && (
            <span className="text-[11px] text-muted-foreground">Loading…</span>
          )}
        </div>

        {/* Results */}
        <div
          ref={listRef}
          className="max-h-[340px] overflow-y-auto overscroll-contain"
        >
          {hits.length === 0 && !loading && (
            <div className="px-4 py-6 text-center text-[12px] text-muted-foreground">
              {root ? "No files found" : "No workspace open"}
            </div>
          )}
          {hits.map((hit, idx) => {
            const dir = dirname(hit.rel);
            return (
              <button
                key={hit.path}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(idx);
                }}
                onMouseEnter={() => setActiveIdx(idx)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left",
                  idx === activeIdx
                    ? "bg-accent/60 text-foreground"
                    : "text-foreground hover:bg-muted/40",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium">
                    {hit.name}
                  </span>
                  {dir && (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {dir}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 border-t border-border/40 px-3 py-1.5 text-[10.5px] text-muted-foreground/70">
          <span><kbd className="font-mono">↵</kbd> open</span>
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
