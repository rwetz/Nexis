// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * A folder of SVGs, seen as a set rather than as files.
 *
 * The panel this codebase needed and did not have. CLAUDE.md pitfall #18 is
 * the story of an icon surface that drifted to 136 distinct ideas across 13
 * pixel sizes and 12 stroke weights, one harmless-looking addition at a time,
 * because nothing ever looked at them together. Two things here are the
 * answer: a **grid at the sizes icons are judged at**, and an audit that
 * compares the set against itself.
 *
 * Findings never say a file is wrong — only that it is in a minority. Which
 * spelling is correct is the author's call; a linter that decides for you is a
 * linter people turn off. See `lib/iconAudit.ts`.
 */

import { Icon } from "@/components/icon";
import { basename } from "@/lib/path";
import { cn } from "@/lib/utils";
import { native } from "@/modules/ai/lib/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  auditIcons,
  readIconFacts,
  summarize,
  type IconFacts,
} from "./lib/iconAudit";
import { sanitizeSvgForPreview } from "./lib/svgSanitize";

/** The sizes an icon is actually judged at — same set as the playground's. */
const PREVIEW_SIZES = [16, 24, 32] as const;

/**
 * A ceiling on how many files one scan will read.
 *
 * Pointed at a workspace root rather than an icon folder, this would otherwise
 * try to read every SVG in `node_modules`. The cap keeps a mis-aimed scan to a
 * moment rather than a hang, and the panel says when it was hit.
 */
const MAX_FILES = 400;

type Entry = { facts: IconFacts; source: string };

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; entries: Entry[]; truncated: boolean }
  | { kind: "error"; message: string };

type Props = {
  /** The folder scanned when no other is given. */
  workspaceRoot: string | null;
};

export function IconSetPanel({ workspaceRoot }: Props) {
  const [dir, setDir] = useState<string>(workspaceRoot ?? "");
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const [selected, setSelected] = useState<string | null>(null);
  const [size, setSize] = useState<number>(24);

  useEffect(() => {
    if (workspaceRoot && dir === "") setDir(workspaceRoot);
  }, [workspaceRoot, dir]);

  const scan = useCallback(async () => {
    const root = dir.trim();
    if (!root) return;
    setState({ kind: "loading" });
    setSelected(null);
    try {
      const listing = await native.readDir(root);
      const all = listing.filter(
        (e) => e.kind === "file" && e.name.toLowerCase().endsWith(".svg"),
      );
      const svgs = all.slice(0, MAX_FILES);

      const base = root.replace(/[\/]+$/, "");
      const entries: Entry[] = [];
      for (const file of svgs) {
        const failed = (message: string): Entry => ({
          facts: { ...readIconFacts({ name: file.name, source: "" }), error: message },
          source: "",
        });
        try {
          const read = await native.readFile(`${base}/${file.name}`);
          if (read.kind !== "text") {
            // A binary or oversized "SVG" is a finding, not a crash — and it
            // is exactly the kind of thing a folder of exports collects.
            entries.push(failed(`not readable as text (${read.kind})`));
            continue;
          }
          entries.push({
            facts: readIconFacts({ name: file.name, source: read.content }),
            source: read.content,
          });
        } catch (e) {
          // A file the backend refuses (a symlink, a permissions problem) is
          // reported in the set rather than aborting the scan.
          entries.push(failed(String(e)));
        }
      }
      setState({ kind: "ready", entries, truncated: all.length > svgs.length });
    } catch (e) {
      setState({ kind: "error", message: String(e) });
    }
  }, [dir]);

  const entries = state.kind === "ready" ? state.entries : [];
  const facts = useMemo(() => entries.map((e) => e.facts), [entries]);
  const findings = useMemo(() => auditIcons(facts), [facts]);

  const selectedEntry = entries.find((e) => e.facts.name === selected) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <Icon name="grid" className="text-muted-foreground" />
        <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          Icon Set
        </span>
        {state.kind === "ready" && (
          <span className="ml-auto truncate text-[10px] text-muted-foreground/60">
            {summarize(facts)}
          </span>
        )}
      </div>

      {/* Folder */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border/50 px-2 py-1.5">
        <input
          value={dir}
          onChange={(e) => setDir(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void scan();
          }}
          spellCheck={false}
          placeholder="Folder of .svg files"
          aria-label="Folder to scan"
          className="min-w-0 flex-1 rounded-md border border-border/60 bg-background/60 px-1.5 py-0.5 font-mono text-[10px] focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
        />
        <button
          type="button"
          onClick={() => void scan()}
          disabled={state.kind === "loading" || dir.trim() === ""}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-md border border-border/60 bg-card px-2 py-0.5 text-[10.5px] transition-colors",
            "hover:border-border hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <Icon name="search" size="xs" />
          Scan
        </button>
      </div>

      {state.kind === "error" && (
        <div className="border-b border-border/50 px-3 py-2">
          <p className="text-[10.5px] break-words text-destructive">
            {state.message}
          </p>
        </div>
      )}

      {/* Findings */}
      {findings.length > 0 && (
        <div className="shrink-0 border-b border-border/50">
          <ul className="flex flex-col">
            {findings.map((f) => (
              <li key={f.kind} className="px-3 py-1.5">
                <p
                  className={cn(
                    "flex items-start gap-1.5 text-[10.5px] leading-relaxed",
                    f.severity === "warn"
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground",
                  )}
                >
                  <Icon name="alert" size="xs" className="mt-px shrink-0" />
                  <span>
                    <span className="font-medium">{f.files.length}</span>{" "}
                    {f.message}
                  </span>
                </p>
                <p className="mt-0.5 pl-4 font-mono text-[9.5px] break-words text-muted-foreground/60">
                  {f.files.slice(0, 8).join(", ")}
                  {f.files.length > 8 ? ` +${f.files.length - 8} more` : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.kind === "ready" && findings.length === 0 && entries.length > 0 && (
        <div className="shrink-0 border-b border-border/50 px-3 py-1.5">
          <p className="flex items-center gap-1.5 text-[10.5px] text-green-500">
            <Icon name="success" size="xs" />
            Consistent: one canvas size, one stroke weight, no baked-in colour.
          </p>
        </div>
      )}

      {/* Size row */}
      {entries.length > 0 && (
        <div className="flex shrink-0 items-center gap-1 border-b border-border/50 px-2 py-1.5">
          <span className="text-[10px] text-muted-foreground/70">Render at</span>
          {PREVIEW_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={size === s}
              onClick={() => setSize(s)}
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
                size === s
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s}
            </button>
          ))}
          {state.kind === "ready" && state.truncated && (
            <span className="ml-auto text-[9.5px] text-amber-500">
              first {MAX_FILES}
            </span>
          )}
        </div>
      )}

      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {state.kind === "loading" ? (
          <p className="p-4 text-center text-[11px] text-muted-foreground/60">
            Reading…
          </p>
        ) : entries.length === 0 ? (
          <p className="p-4 text-center text-[11px] leading-relaxed text-muted-foreground/60">
            {state.kind === "ready"
              ? "No .svg files in that folder."
              : "Point this at a folder of icons and scan. It compares the set against itself — canvas sizes, stroke weights, baked-in colour."}
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-1.5">
            {entries.map((entry) => (
              <IconTile
                key={entry.facts.name}
                entry={entry}
                size={size}
                selected={entry.facts.name === selected}
                onSelect={() => setSelected(entry.facts.name)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Selected detail */}
      {selectedEntry && (
        <div className="shrink-0 border-t border-border/50 px-3 py-2">
          <p className="truncate font-mono text-[10.5px]">
            {basename(selectedEntry.facts.name)}
          </p>
          <p className="mt-0.5 text-[9.5px] leading-relaxed text-muted-foreground/70">
            {selectedEntry.facts.error
              ? selectedEntry.facts.error
              : [
                  selectedEntry.facts.viewBox
                    ? `viewBox ${selectedEntry.facts.viewBox.join(" ")}`
                    : "no viewBox",
                  selectedEntry.facts.strokeWidths.length
                    ? `stroke ${selectedEntry.facts.strokeWidths.join(", ")}`
                    : "no stroke width",
                  selectedEntry.facts.usesCurrentColor
                    ? "currentColor"
                    : selectedEntry.facts.literalColors.join(", ") || "no paint",
                  `${selectedEntry.facts.elementCount} elements`,
                  `${selectedEntry.facts.bytes} bytes`,
                ].join(" · ")}
          </p>
        </div>
      )}
    </div>
  );
}

function IconTile({
  entry,
  size,
  selected,
  onSelect,
}: {
  entry: Entry;
  size: number;
  selected: boolean;
  onSelect: () => void;
}) {
  // Sanitized like every other preview in the pack: these are files from
  // someone's disk, which is exactly the case svgSanitize.ts exists for.
  const safe = useMemo(
    () => (entry.source ? sanitizeSvgForPreview(entry.source).svg : ""),
    [entry.source],
  );

  return (
    <button
      type="button"
      onClick={onSelect}
      title={entry.facts.name}
      className={cn(
        "flex flex-col items-center gap-1 rounded-md border p-1.5 transition-colors",
        "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
        selected
          ? "border-primary/50 bg-primary/[0.08]"
          : "border-border/50 bg-card/30 hover:border-border",
      )}
    >
      <div
        className="flex items-center justify-center text-foreground"
        style={{ width: size, height: size }}
      >
        {entry.facts.error ? (
          <Icon name="alert" size="sm" className="text-destructive" />
        ) : (
          <div
            className="[&>svg]:h-full [&>svg]:w-full"
            style={{ width: size, height: size }}
            dangerouslySetInnerHTML={{ __html: safe }}
          />
        )}
      </div>
      <span className="w-full truncate text-center text-[8.5px] text-muted-foreground/70">
        {entry.facts.name.replace(/\.svg$/i, "")}
      </span>
    </button>
  );
}
