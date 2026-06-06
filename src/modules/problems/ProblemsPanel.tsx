// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useDiagnosticsStore } from "./diagnosticsStore";
import type { LspDiagnostic } from "@/modules/lsp/protocol";

type Filter = "all" | "errors" | "warnings";

type Props = {
  /** Called when the user clicks a diagnostic — navigate to that file+line. */
  onNavigate: (path: string, line: number, character: number) => void;
};

export function ProblemsPanel({ onNavigate }: Props) {
  const byFile = useDiagnosticsStore((s) => s.byFile);
  const errorCount = useDiagnosticsStore((s) => s.errorCount);
  const warningCount = useDiagnosticsStore((s) => s.warningCount);
  const [filter, setFilter] = useState<Filter>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const files = useMemo(() => {
    const entries: { path: string; diags: LspDiagnostic[] }[] = [];
    for (const [path, diags] of byFile) {
      const filtered = diags.filter((d) => {
        if (filter === "errors") return d.severity === 1;
        if (filter === "warnings") return d.severity === 2;
        return true;
      });
      if (filtered.length > 0) {
        entries.push({ path, diags: filtered });
      }
    }
    // Sort: files with errors first, then warnings, then alphabetically
    entries.sort((a, b) => {
      const aErr = a.diags.some((d) => d.severity === 1);
      const bErr = b.diags.some((d) => d.severity === 1);
      if (aErr !== bErr) return aErr ? -1 : 1;
      return a.path.localeCompare(b.path);
    });
    return entries;
  }, [byFile, filter]);

  const toggleCollapse = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const isEmpty = files.length === 0;

  return (
    <div className="flex h-full flex-col bg-card text-[11px]">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border/40 px-3 py-1.5">
        <span className="font-semibold uppercase tracking-wider text-muted-foreground text-[10px]">
          Problems
        </span>

        {/* Counts */}
        <div className="flex items-center gap-2">
          {errorCount > 0 && (
            <span className="flex items-center gap-1 text-[10.5px] text-red-400">
              <ErrorIcon />
              {errorCount}
            </span>
          )}
          {warningCount > 0 && (
            <span className="flex items-center gap-1 text-[10.5px] text-yellow-400">
              <WarnIcon />
              {warningCount}
            </span>
          )}
          {errorCount === 0 && warningCount === 0 && (
            <span className="text-[10px] text-muted-foreground/50">No problems</span>
          )}
        </div>

        {/* Filter tabs */}
        <div className="ml-auto flex items-center gap-px">
          {(["all", "errors", "warnings"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded px-2 py-0.5 text-[10px] font-medium capitalize transition-colors",
                filter === f
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-auto">
        {isEmpty ? (
          <div className="flex h-full items-center justify-center text-[10.5px] text-muted-foreground/40">
            {filter === "all" ? "No problems detected" : `No ${filter}`}
          </div>
        ) : (
          <div className="py-0.5">
            {files.map(({ path, diags }) => (
              <FileGroup
                key={path}
                path={path}
                diags={diags}
                collapsed={collapsed.has(path)}
                onToggle={() => toggleCollapse(path)}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── File group ────────────────────────────────────────────────────────────────

function FileGroup({
  path,
  diags,
  collapsed,
  onToggle,
  onNavigate,
}: {
  path: string;
  diags: LspDiagnostic[];
  collapsed: boolean;
  onToggle: () => void;
  onNavigate: (path: string, line: number, character: number) => void;
}) {
  const fileName = path.replace(/\\/g, "/").split("/").pop() ?? path;
  const dirPart = path
    .replace(/\\/g, "/")
    .split("/")
    .slice(0, -1)
    .join("/");

  const errCount = diags.filter((d) => d.severity === 1).length;
  const warnCount = diags.filter((d) => d.severity === 2).length;

  return (
    <div>
      {/* File row */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 px-3 py-0.5 text-left hover:bg-muted/30 group"
      >
        <span className="text-[8px] text-muted-foreground/60 w-2 shrink-0">
          {collapsed ? "▶" : "▼"}
        </span>
        <span className="font-medium text-foreground/90 truncate">{fileName}</span>
        <span className="truncate text-[10px] text-muted-foreground/50 min-w-0 flex-1">
          {dirPart}
        </span>
        <span className="ml-auto shrink-0 flex items-center gap-1.5">
          {errCount > 0 && (
            <span className="flex items-center gap-0.5 text-red-400">
              <ErrorIcon size={9} />
              <span className="text-[9.5px]">{errCount}</span>
            </span>
          )}
          {warnCount > 0 && (
            <span className="flex items-center gap-0.5 text-yellow-400">
              <WarnIcon size={9} />
              <span className="text-[9.5px]">{warnCount}</span>
            </span>
          )}
        </span>
      </button>

      {/* Diagnostic rows */}
      {!collapsed &&
        diags.map((d) => (
          <DiagRow
            key={`${d.range.start.line}:${d.range.start.character}:${d.message}`}
            diag={d}
            onClick={() =>
              onNavigate(path, d.range.start.line, d.range.start.character)
            }
          />
        ))}
    </div>
  );
}

// ── Diagnostic row ────────────────────────────────────────────────────────────

function DiagRow({
  diag,
  onClick,
}: {
  diag: LspDiagnostic;
  onClick: () => void;
}) {
  const isError = diag.severity === 1;
  const isWarn = diag.severity === 2;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-2 px-3 py-[3px] pl-7 text-left",
        "hover:bg-muted/20 group",
      )}
    >
      {/* Severity icon */}
      <span
        className={cn(
          "mt-px shrink-0",
          isError && "text-red-400",
          isWarn && "text-yellow-400",
          !isError && !isWarn && "text-blue-400",
        )}
      >
        {isError ? <ErrorIcon size={10} /> : isWarn ? <WarnIcon size={10} /> : <InfoIcon size={10} />}
      </span>

      {/* Message */}
      <span className="min-w-0 flex-1 text-[10.5px] text-foreground/80 leading-snug">
        {diag.message}
        {diag.source && (
          <span className="ml-1 text-muted-foreground/50">({diag.source})</span>
        )}
      </span>

      {/* Location */}
      <span className="ml-auto shrink-0 font-mono text-[9.5px] text-muted-foreground/50">
        {diag.range.start.line + 1}:{diag.range.start.character + 1}
      </span>
    </button>
  );
}

// ── Tiny SVG icons (no dep needed) ───────────────────────────────────────────

function ErrorIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <circle cx="8" cy="8" r="7.5" stroke="currentColor" strokeWidth="1" fill="none" />
      <path d="M8 4.5v4M8 10.5v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function WarnIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path
        d="M8 1.5L1 14.5h14L8 1.5z"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
        strokeLinejoin="round"
      />
      <path d="M8 6v4M8 11.5v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function InfoIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <circle cx="8" cy="8" r="7.5" stroke="currentColor" strokeWidth="1" fill="none" />
      <path d="M8 7v5M8 4.5v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
