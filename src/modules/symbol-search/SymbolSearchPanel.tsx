// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * SymbolSearchPanel — semantic / AST-aware search.
 *
 * Translates structural queries like `fn:functionName`, `class:ClassName`,
 * `hook:useX`, `import:module`, `type:TypeName` into language-aware regex
 * patterns and runs them through the existing `fs_grep` IPC.
 *
 * Falls back to plain regex when no structural prefix is detected.
 */
import { native } from "@/modules/ai/lib/native";
import { cn } from "@/lib/utils";
import {
  Cancel01Icon,
  Search01Icon,
  FileCodeIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { CodeSquareIcon } from "@hugeicons/core-free-icons";
import type { GrepHit } from "@/modules/ai/lib/native";
import { basename, displayDirname as dirname } from "@/lib/path";
import { useCallback, useEffect, useRef, useState } from "react";

// ── Pattern translation ───────────────────────────────────────────────────────

type StructuralKind =
  | "fn"
  | "class"
  | "hook"
  | "import"
  | "type"
  | "interface"
  | "const"
  | "plain";

const KIND_LABELS: Record<StructuralKind, string> = {
  fn: "function",
  class: "class",
  hook: "hook",
  import: "import",
  type: "type",
  interface: "interface",
  const: "const",
  plain: "text",
};

/** Parse a structural prefix from the query string */
function parseQuery(raw: string): { kind: StructuralKind; term: string } {
  const m = raw.match(/^(fn|class|hook|import|type|interface|const):(.+)/i);
  if (m) {
    const kind = m[1].toLowerCase() as StructuralKind;
    return { kind, term: m[2].trim() };
  }
  // Auto-detect React hook pattern
  if (/^use[A-Z]/.test(raw.trim())) {
    return { kind: "hook", term: raw.trim() };
  }
  return { kind: "plain", term: raw };
}

/**
 * Produce a regex that matches the structural pattern across common languages.
 * Designed to work with ripgrep (the backend for `fs_grep`).
 */
function toRegex(kind: StructuralKind, term: string): string {
  const esc = escapeRegex(term);
  switch (kind) {
    case "fn":
      // JS/TS: function foo | const foo = | async function foo
      // Rust: fn foo | pub fn foo
      // Python: def foo
      // Go: func foo
      return `(function\\s+${esc}|const\\s+${esc}\\s*=|async\\s+function\\s+${esc}|def\\s+${esc}|fn\\s+${esc}|func\\s+${esc})`;
    case "class":
      return `class\\s+${esc}`;
    case "hook":
      // React hooks: function useX | const useX = | export function useX
      return `(function\\s+${esc}|const\\s+${esc}\\s*=)`;
    case "import":
      // from 'term' | require('term') | import 'term'
      return `(from\\s+['"]${esc}|require\\(['"]${esc}|import\\s+['"]${esc})`;
    case "type":
      // TS: type Foo = | interface Foo | : Foo
      return `(type\\s+${esc}\\s*=|interface\\s+${esc})`;
    case "interface":
      return `interface\\s+${esc}`;
    case "const":
      return `(const|let|var)\\s+${esc}\\s*=`;
    case "plain":
    default:
      return term;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  workspaceRoot: string | null;
  onOpenFile?: (path: string) => void;
};

const MAX_RESULTS = 200;


export function SymbolSearchPanel({ workspaceRoot, onOpenFile }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GrepHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  const runSearch = useCallback(
    async (raw: string) => {
      if (!workspaceRoot || !raw.trim()) {
        setResults([]);
        setSearched(false);
        return;
      }
      // Cancel previous search
      abortRef.current.cancelled = true;
      const ticket = { cancelled: false };
      abortRef.current = ticket;

      setSearching(true);
      setError(null);

      try {
        const { kind, term } = parseQuery(raw.trim());
        const pattern = toRegex(kind, term);

        const resp = await native.grep({
          pattern,
          root: workspaceRoot,
          caseInsensitive: false,
          maxResults: MAX_RESULTS,
        });

        if (ticket.cancelled) return;
        setResults(resp.hits);
        setTruncated(resp.truncated);
        setSearched(true);
      } catch (e) {
        if (ticket.cancelled) return;
        setError(String(e));
        setResults([]);
        setSearched(true);
      } finally {
        if (!ticket.cancelled) setSearching(false);
      }
    },
    [workspaceRoot],
  );

  // Debounced search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setSearched(false);
      setSearching(false);
      return;
    }
    debounceRef.current = setTimeout(() => void runSearch(query), 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  const { kind } = parseQuery(query.trim() || "plain:");
  const kindLabel = KIND_LABELS[kind];

  // Group results by file
  const byFile = results.reduce<Record<string, GrepHit[]>>((acc, hit) => {
    (acc[hit.rel] ??= []).push(hit);
    return acc;
  }, {});

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <HugeiconsIcon
          icon={CodeSquareIcon}
          size={13}
          strokeWidth={1.75}
          className="text-muted-foreground"
        />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Symbol Search
        </span>
        {searching && (
          <span className="ml-auto text-[10px] text-muted-foreground/60">
            Searching…
          </span>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 border-b border-border/30 px-3 py-2">
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            size={12}
            strokeWidth={1.75}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search symbols"
            placeholder='fn:name · class:Foo · hook:useBar · import:react'
            className="w-full rounded-md border border-border/60 bg-muted/30 py-1.5 pl-7 pr-7 text-xs text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/60"
            // A search panel the user has just opened in order to type a query;
            // requiring a further Tab to reach the only input would make the
            // panel slower for keyboard users, not safer.
            // react-doctor-disable-next-line react-doctor/no-autofocus
            autoFocus
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2} />
            </button>
          )}
        </div>

        {/* Pattern hint */}
        {query && (
          <p className="mt-1 text-[9.5px] text-muted-foreground/60">
            Mode:{" "}
            <span className="font-semibold text-primary/70">{kindLabel}</span>
            {kind !== "plain" && (
              <> · prefix with <code className="rounded bg-muted px-0.5">fn:</code> <code className="rounded bg-muted px-0.5">class:</code> <code className="rounded bg-muted px-0.5">import:</code> etc. to filter by symbol type</>
            )}
          </p>
        )}
      </div>

      {/* Results */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!workspaceRoot ? (
          <Empty>No workspace open</Empty>
        ) : error ? (
          <Empty>{error}</Empty>
        ) : !searched && !searching ? (
          <Empty>
            Type a symbol name to search.{" "}
            <br />
            Prefix with <code className="text-primary">fn:</code> <code className="text-primary">class:</code> <code className="text-primary">import:</code> <code className="text-primary">type:</code> for structural search.
          </Empty>
        ) : searched && results.length === 0 ? (
          <Empty>No matches found</Empty>
        ) : (
          <>
            {truncated && (
              <p className="px-3 py-1.5 text-[10px] text-amber-500/80">
                Showing first {MAX_RESULTS} results — refine the query for more precision
              </p>
            )}
            {Object.entries(byFile).map(([rel, hits]) => (
              <div key={rel} className="mb-1">
                {/* File header */}
                <div className="sticky top-0 flex items-center gap-1.5 bg-card/90 px-2.5 py-1 backdrop-blur">
                  <HugeiconsIcon
                    icon={FileCodeIcon}
                    size={11}
                    strokeWidth={1.75}
                    className="shrink-0 text-muted-foreground/60"
                  />
                  <span className="truncate text-[10.5px] font-semibold">
                    {basename(rel)}
                  </span>
                  <span className="truncate text-[10px] text-muted-foreground/50">
                    {dirname(rel)}
                  </span>
                  <span className="ml-auto shrink-0 text-[9px] text-muted-foreground/50">
                    {hits.length}
                  </span>
                </div>

                {/* Hit rows */}
                {hits.map((hit) => (
                  <button
                    key={`${hit.path}:${hit.line}`}
                    type="button"
                    onClick={() => onOpenFile?.(hit.path)}
                    className={cn(
                      "flex w-full items-start gap-2 px-3 py-1 text-left hover:bg-muted/30",
                      !onOpenFile && "cursor-default",
                    )}
                  >
                    <span className="shrink-0 pt-0.5 font-mono text-[9px] text-muted-foreground/40 tabular-nums">
                      {hit.line}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-foreground/80">
                      {hit.text.trimStart()}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-8 text-center">
      <p className="text-[11px] leading-relaxed text-muted-foreground/60">{children}</p>
    </div>
  );
}
