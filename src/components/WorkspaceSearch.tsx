import { cn } from "@/lib/utils";
import { native, type GrepHit } from "@/modules/ai/lib/native";
import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  ReplaceIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useRef, useState } from "react";

type FileGroup = {
  path: string;
  rel: string;
  hits: GrepHit[];
  replacedCount?: number;
};

type Props = {
  root: string | null;
  onOpenFile?: (path: string) => void;
  onClose: () => void;
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function basename(p: string) {
  const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? p;
}
function relDir(rel: string) {
  const parts = rel.replace(/\\/g, "/").split("/");
  return parts.slice(0, -1).join("/") || ".";
}

export function WorkspaceSearch({ root, onOpenFile, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [replace, setReplace] = useState("");
  const [isRegex, setIsRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [groups, setGroups] = useState<FileGroup[]>([]);
  const [searching, setSearching] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [totalHits, setTotalHits] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [replacedFiles, setReplacedFiles] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const runSearch = useCallback(
    async (q: string) => {
      if (!q.trim() || !root) {
        setGroups([]);
        setTotalHits(0);
        return;
      }
      setSearching(true);
      try {
        const pattern = isRegex ? q : escapeRegex(q);
        const result = await native.grep({
          pattern,
          root,
          caseInsensitive: !caseSensitive,
          maxResults: 500,
        });
        const byFile = new Map<string, FileGroup>();
        for (const hit of result.hits) {
          let g = byFile.get(hit.path);
          if (!g) {
            g = { path: hit.path, rel: hit.rel, hits: [] };
            byFile.set(hit.path, g);
          }
          g.hits.push(hit);
        }
        setGroups(Array.from(byFile.values()));
        setTotalHits(result.hits.length);
        setTruncated(result.truncated);
      } catch {
        setGroups([]);
        setTotalHits(0);
      } finally {
        setSearching(false);
      }
    },
    [root, isRegex, caseSensitive],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runSearch(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  const doReplaceAll = async () => {
    if (!query.trim() || groups.length === 0) return;
    setReplacing(true);
    let filesDone = 0;
    try {
      const pattern = isRegex ? query : escapeRegex(query);
      const regex = new RegExp(pattern, caseSensitive ? "g" : "gi");
      for (const g of groups) {
        try {
          const r = await native.readFile(g.path);
          if (r.kind !== "text") continue;
          const updated = r.content.replace(regex, replace);
          if (updated === r.content) continue;
          await native.writeFile(g.path, updated);
          filesDone++;
        } catch {
          // skip files that fail
        }
      }
      setReplacedFiles(filesDone);
      // Re-run search to clear matched lines
      await runSearch(query);
    } finally {
      setReplacing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "Enter" && !e.shiftKey) void runSearch(query);
  };

  return (
    <div
      className="pointer-events-none absolute inset-0 z-40 flex items-start justify-center pt-16"
      onClick={onClose}
    >
      <div
        className="pointer-events-auto flex max-h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search inputs */}
        <div className="flex shrink-0 flex-col gap-2 border-b border-border/50 p-3">
          <div className="flex items-center gap-2">
            <HugeiconsIcon
              icon={Search01Icon}
              size={14}
              strokeWidth={1.75}
              className="shrink-0 text-muted-foreground"
            />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Find in project…"
              className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60"
            />
            <button
              type="button"
              title="Use regular expression"
              onClick={() => setIsRegex((v) => !v)}
              className={cn(
                "rounded px-1.5 py-0.5 text-[11px] font-mono transition-colors",
                isRegex
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              .*
            </button>
            <button
              type="button"
              title="Match case"
              onClick={() => setCaseSensitive((v) => !v)}
              className={cn(
                "rounded px-1.5 py-0.5 text-[11px] transition-colors",
                caseSensitive
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              Aa
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <HugeiconsIcon
              icon={ReplaceIcon}
              size={14}
              strokeWidth={1.75}
              className="shrink-0 text-muted-foreground"
            />
            <input
              value={replace}
              onChange={(e) => setReplace(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Replace with…"
              className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60"
            />
            {groups.length > 0 && (
              <button
                type="button"
                disabled={replacing}
                onClick={() => void doReplaceAll()}
                className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                Replace all
              </button>
            )}
          </div>
        </div>

        {/* Status bar */}
        {(searching || truncated || replacedFiles > 0 || totalHits > 0) && (
          <div className="flex shrink-0 items-center gap-2 border-b border-border/30 px-3 py-1.5">
            {searching && (
              <span className="text-[11px] text-muted-foreground">Searching…</span>
            )}
            {!searching && totalHits > 0 && (
              <span className="text-[11px] text-muted-foreground">
                {totalHits} result{totalHits !== 1 ? "s" : ""} in{" "}
                {groups.length} file{groups.length !== 1 ? "s" : ""}
                {truncated ? " (truncated)" : ""}
              </span>
            )}
            {!searching && totalHits === 0 && query && (
              <span className="text-[11px] text-muted-foreground">No results</span>
            )}
            {replacedFiles > 0 && (
              <span className="ml-auto flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400">
                <HugeiconsIcon icon={CheckmarkCircle01Icon} size={12} strokeWidth={1.75} />
                Replaced in {replacedFiles} file{replacedFiles !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}

        {/* Results */}
        <div className="overflow-y-auto">
          {groups.map((g) => (
            <FileGroupRow
              key={g.path}
              group={g}
              query={query}
              isRegex={isRegex}
              caseSensitive={caseSensitive}
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FileGroupRow({
  group,
  query,
  isRegex,
  caseSensitive,
  onOpenFile,
}: {
  group: FileGroup;
  query: string;
  isRegex: boolean;
  caseSensitive: boolean;
  onOpenFile?: (path: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="border-b border-border/20 last:border-none">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/40"
      >
        <span
          className={cn(
            "shrink-0 text-[9px] text-muted-foreground transition-transform",
            collapsed ? "-rotate-90" : "rotate-0",
          )}
        >
          ▼
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-medium text-foreground">
          {basename(group.rel)}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {relDir(group.rel)} · {group.hits.length}
        </span>
      </button>
      {!collapsed && (
        <div className="flex flex-col">
          {group.hits.map((hit, i) => (
            <HitRow
              key={i}
              hit={hit}
              query={query}
              isRegex={isRegex}
              caseSensitive={caseSensitive}
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HitRow({
  hit,
  query,
  isRegex,
  caseSensitive,
  onOpenFile,
}: {
  hit: GrepHit;
  query: string;
  isRegex: boolean;
  caseSensitive: boolean;
  onOpenFile?: (path: string) => void;
}) {
  const highlighted = highlightMatch(hit.text, query, isRegex, caseSensitive);

  return (
    <button
      type="button"
      onClick={() => onOpenFile?.(hit.path)}
      className="flex items-start gap-3 px-3 py-1 text-left hover:bg-muted/30"
    >
      <span className="w-8 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground/60">
        {hit.line}
      </span>
      <span
        className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-foreground"
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </button>
  );
}

function highlightMatch(
  text: string,
  query: string,
  isRegex: boolean,
  caseSensitive: boolean,
): string {
  if (!query) return escapeHtml(text);
  try {
    const pattern = isRegex ? query : escapeRegex(query);
    const flags = caseSensitive ? "g" : "gi";
    const re = new RegExp(pattern, flags);
    return text.replace(re, (m) =>
      `<mark class="rounded-sm bg-yellow-400/30 text-foreground">${escapeHtml(m)}</mark>`,
    );
  } catch {
    return escapeHtml(text);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
