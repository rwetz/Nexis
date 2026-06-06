// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * BookmarksPanel — sidebar panel for managing file + line bookmarks.
 *
 * Use Alt+D (default) from the editor to add/remove the bookmark at the
 * current cursor position.  Bookmarks are grouped by file and stored in
 * localStorage — they persist across restarts.
 */
import { cn } from "@/lib/utils";
import {
  BookmarkAdd01Icon,
  BookmarkRemove01Icon,
  Delete01Icon,
  Edit02Icon,
  FileCodeIcon,
  Tick01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useRef, useState } from "react";
import {
  removeBookmark,
  updateBookmarkLabel,
  useBookmarks,
  type Bookmark,
} from "./bookmarkStore";

type Props = {
  onNavigate?: (path: string, line: number) => void;
};

function basename(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() ?? path;
}

function dirname(path: string): string {
  const n = path.replace(/\\/g, "/");
  const i = n.lastIndexOf("/");
  return i > 0 ? n.slice(0, i) : "";
}

export function BookmarksPanel({ onNavigate }: Props) {
  const bookmarks = useBookmarks();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editRef = useRef<HTMLInputElement>(null);

  // Group by file
  const byFile = [...bookmarks].reduce<Record<string, Bookmark[]>>((acc, bm) => {
    (acc[bm.path] ??= []).push(bm);
    return acc;
  }, {});

  // Sort each group by line
  for (const arr of Object.values(byFile)) {
    arr.sort((a, b) => a.line - b.line);
  }

  const startEdit = useCallback((bm: Bookmark) => {
    setEditingId(bm.id);
    setEditValue(bm.label);
    setTimeout(() => editRef.current?.focus(), 40);
  }, []);

  const commitEdit = useCallback(
    (id: string) => {
      const trimmed = editValue.trim();
      if (trimmed) updateBookmarkLabel(id, trimmed);
      setEditingId(null);
    },
    [editValue],
  );

  const handleEditKey = useCallback(
    (e: React.KeyboardEvent, id: string) => {
      if (e.key === "Enter") { e.preventDefault(); commitEdit(id); }
      if (e.key === "Escape") setEditingId(null);
    },
    [commitEdit],
  );

  const handleNavigate = useCallback(
    (bm: Bookmark) => {
      onNavigate?.(bm.path, bm.line);
    },
    [onNavigate],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <HugeiconsIcon
          icon={BookmarkAdd01Icon}
          size={13}
          strokeWidth={1.75}
          className="text-muted-foreground"
        />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Bookmarks
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground/50">
          {bookmarks.length > 0 ? `${bookmarks.length}` : ""}
        </span>
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {bookmarks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <HugeiconsIcon
              icon={BookmarkAdd01Icon}
              size={24}
              strokeWidth={1.5}
              className="text-muted-foreground/30"
            />
            <p className="text-[11px] leading-relaxed text-muted-foreground/60">
              No bookmarks yet.
              <br />
              Press <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">Alt+D</kbd> in the editor
              <br />
              to bookmark the current line.
            </p>
          </div>
        ) : (
          <div>
            {Object.entries(byFile).map(([filePath, bms]) => (
              <div key={filePath} className="mb-0.5">
                {/* File header */}
                <div className="sticky top-0 flex items-center gap-1.5 bg-card/90 px-2.5 py-1.5 backdrop-blur">
                  <HugeiconsIcon
                    icon={FileCodeIcon}
                    size={11}
                    strokeWidth={1.75}
                    className="shrink-0 text-muted-foreground/60"
                  />
                  <span className="truncate text-[10.5px] font-semibold">
                    {basename(filePath)}
                  </span>
                  <span className="truncate text-[10px] text-muted-foreground/40">
                    {dirname(filePath)}
                  </span>
                  <span className="ml-auto shrink-0 text-[9px] text-muted-foreground/40">
                    {bms.length}
                  </span>
                </div>

                {/* Bookmark rows */}
                {bms.map((bm) => (
                  <div
                    key={bm.id}
                    className="group flex items-center gap-2 px-3 py-1.5 hover:bg-muted/20"
                  >
                    {/* Line gutter */}
                    {bm.line > 0 && (
                      <span className="w-8 shrink-0 font-mono text-[9px] text-muted-foreground/40 tabular-nums">
                        :{bm.line}
                      </span>
                    )}

                    {/* Label — editable on click */}
                    {editingId === bm.id ? (
                      <input
                        ref={editRef}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => handleEditKey(e, bm.id)}
                        onBlur={() => commitEdit(bm.id)}
                        className="flex-1 rounded border border-primary/60 bg-background/60 px-1.5 py-0.5 text-xs text-foreground outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleNavigate(bm)}
                        className={cn(
                          "min-w-0 flex-1 truncate text-left text-[11px] text-foreground/80 hover:text-foreground",
                          !onNavigate && "cursor-default",
                        )}
                        title={`${bm.path}${bm.line > 0 ? `:${bm.line}` : ""}`}
                      >
                        {bm.label}
                      </button>
                    )}

                    {/* Actions */}
                    <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      {editingId === bm.id ? (
                        <button
                          type="button"
                          onClick={() => commitEdit(bm.id)}
                          className="flex h-5 w-5 items-center justify-center rounded text-green-500 hover:bg-green-500/10"
                        >
                          <HugeiconsIcon icon={Tick01Icon} size={10} strokeWidth={2} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          title="Rename"
                          onClick={() => startEdit(bm)}
                          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <HugeiconsIcon icon={Edit02Icon} size={10} strokeWidth={1.75} />
                        </button>
                      )}
                      <button
                        type="button"
                        title="Remove bookmark"
                        onClick={() => removeBookmark(bm.id)}
                        className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                      >
                        <HugeiconsIcon icon={BookmarkRemove01Icon} size={10} strokeWidth={1.75} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {/* Clear all */}
            <div className="flex justify-center py-2">
              <button
                type="button"
                onClick={() => {
                  for (const bm of bookmarks) removeBookmark(bm.id);
                }}
                className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-red-500"
              >
                <HugeiconsIcon icon={Delete01Icon} size={10} strokeWidth={1.75} />
                Clear all
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
