// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The Art pack's palette: build a set of colours, check them, get them out.
 *
 * Three things it does that a browser palette tool cannot:
 *
 * 1. **Seed from the active Nexis theme.** The theme system puts everything on
 *    the document root as custom properties, so "start from Aurelian" is a
 *    button rather than a copy-paste exercise. See `lib/themePalette.ts`.
 * 2. **Check contrast in the same place you pick.** WCAG ratios against a
 *    chosen background, live, on every swatch — because the moment to find out
 *    a colour is unreadable is while you are choosing it.
 * 3. **Export as an SVG strip**, which drops straight into the playground and
 *    the raster exporter like any other document in the pack.
 *
 * The contrast half is deliberately here rather than in the Web Dev pack,
 * where it was originally parked: picking colours and judging them is one
 * activity, and splitting it across two packs would mean neither is where you
 * are when the question comes up.
 */

import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { native } from "@/modules/ai/lib/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatRatio,
  harmony,
  HARMONIES,
  HARMONY_LABELS,
  parseColor,
  readableOn,
  wcag,
  type Harmony,
} from "./lib/color";
import {
  formatPalette,
  PALETTE_FILE_EXTENSIONS,
  PALETTE_FORMAT_LABELS,
  PALETTE_FORMATS,
  type PaletteEntry,
  type PaletteFormat,
} from "./lib/paletteExport";
import { exportFileName } from "./lib/raster";
import { themePalette } from "./lib/themePalette";

const STORAGE_KEY = "nexis:art:palette";

const STARTER: PaletteEntry[] = [
  { name: "Base", hex: "#3b82f6" },
  { name: "Accent", hex: "#f59e0b" },
  { name: "Ink", hex: "#18181b" },
  { name: "Paper", hex: "#fafafa" },
];

function loadPalette(): PaletteEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return STARTER;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return STARTER;
    // Validate on the way in rather than trusting stored shape: this survives
    // a format change, and a half-valid palette is worse than the starter.
    const entries = parsed.filter(
      (e): e is PaletteEntry =>
        !!e &&
        typeof e === "object" &&
        typeof (e as PaletteEntry).name === "string" &&
        typeof (e as PaletteEntry).hex === "string" &&
        parseColor((e as PaletteEntry).hex) !== null,
    );
    return entries.length > 0 ? entries : STARTER;
  } catch {
    return STARTER;
  }
}

type Props = {
  /** Where "Save" writes. Null hides the control. */
  workspaceRoot: string | null;
};

export function PalettePanel({ workspaceRoot }: Props) {
  const [entries, setEntries] = useState<PaletteEntry[]>(loadPalette);
  const [format, setFormat] = useState<PaletteFormat>("css");
  const [contrastAgainst, setContrastAgainst] = useState<string | null>(null);
  const [harmonyKind, setHarmonyKind] = useState<Harmony>("analogous");
  const [status, setStatus] = useState<string | null>(null);
  const statusTimer = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // A full or disabled store is not a reason to break the panel.
    }
  }, [entries]);

  useEffect(() => () => window.clearTimeout(statusTimer.current), []);

  const say = useCallback((text: string) => {
    setStatus(text);
    window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => setStatus(null), 2600);
  }, []);

  const output = useMemo(
    () => formatPalette(entries, format),
    [entries, format],
  );

  // The contrast reference defaults to the darkest swatch, which for almost
  // every palette is the one people mean by "the background".
  const reference = useMemo(() => {
    if (contrastAgainst) return contrastAgainst;
    let darkest = entries[0]?.hex ?? "#000000";
    let best = Infinity;
    for (const e of entries) {
      const rgb = parseColor(e.hex);
      if (!rgb) continue;
      const sum = rgb.r + rgb.g + rgb.b;
      if (sum < best) {
        best = sum;
        darkest = e.hex;
      }
    }
    return darkest;
  }, [contrastAgainst, entries]);

  const update = (i: number, patch: Partial<PaletteEntry>) =>
    setEntries((prev) => prev.map((e, j) => (j === i ? { ...e, ...patch } : e)));

  const remove = (i: number) =>
    setEntries((prev) => prev.filter((_, j) => j !== i));

  const add = () =>
    setEntries((prev) => [
      ...prev,
      { name: `Colour ${prev.length + 1}`, hex: "#888888" },
    ]);

  const seedFromTheme = (source: "ui" | "ansi") => {
    const swatches = themePalette(source);
    if (swatches.length === 0) {
      say("Could not read the theme's colours");
      return;
    }
    setEntries(swatches);
    say(`Loaded ${swatches.length} from the theme`);
  };

  /**
   * Append the generated set rather than replacing the palette.
   *
   * Replacing is the obvious implementation and it is wrong here: entries are
   * persisted the moment they change, so one mis-click would silently destroy
   * a sixteen-swatch palette with no undo. A palette is a collection you build
   * up — unlike the playground's single document, where replacement is the
   * point — so the generated colours join it and unwanted ones are one click
   * each to remove. Colours already present are skipped, so pressing the same
   * button twice does nothing rather than growing duplicates.
   */
  const applyHarmony = (baseHex: string) => {
    setEntries((prev) => {
      const have = new Set(prev.map((e) => e.hex.toLowerCase()));
      const added = harmony(baseHex, harmonyKind)
        .filter((hex) => !have.has(hex.toLowerCase()))
        .map((hex, i) => ({
          name: `${HARMONY_LABELS[harmonyKind]} ${i + 1}`,
          hex,
        }));
      if (added.length === 0) say("Those colours are already in the palette");
      else say(`Added ${added.length} (${HARMONY_LABELS[harmonyKind].toLowerCase()})`);
      return [...prev, ...added];
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(output);
      say("Copied");
    } catch (e) {
      say(`Copy failed: ${String(e)}`);
    }
  };

  const save = async () => {
    if (!workspaceRoot) return;
    try {
      const name = exportFileName("palette", PALETTE_FILE_EXTENSIONS[format]);
      const path = `${workspaceRoot.replace(/\/+$/, "")}/${name}`;
      await native.writeFile(path, output);
      say(`Saved ${name}`);
    } catch (e) {
      say(`Save failed: ${String(e)}`);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <Icon name="theme" className="text-muted-foreground" />
        <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          Palette
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground/60">
          {entries.length}
        </span>
      </div>

      {/* Seeding */}
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border/50 px-2 py-1.5">
        <span className="text-[10px] text-muted-foreground/70">From theme</span>
        <button
          type="button"
          onClick={() => seedFromTheme("ui")}
          title="Load the active theme's interface colours"
          className="rounded-md px-1.5 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
        >
          Interface
        </button>
        <button
          type="button"
          onClick={() => seedFromTheme("ansi")}
          title="Load the active theme's sixteen terminal colours"
          className="rounded-md px-1.5 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
        >
          Terminal
        </button>

        <button
          type="button"
          onClick={add}
          title="Add a swatch"
          className="ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
        >
          <Icon name="add" size="xs" />
          Add
        </button>
      </div>

      {/* Harmony */}
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border/50 px-2 py-1.5">
        <span className="text-[10px] text-muted-foreground/70">Harmony</span>
        {HARMONIES.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={harmonyKind === k}
            onClick={() => setHarmonyKind(k)}
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
              harmonyKind === k
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {HARMONY_LABELS[k]}
          </button>
        ))}
      </div>

      {/* Swatches */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <ul className="flex flex-col gap-1">
          {entries.map((entry, i) => {
            const verdict = wcag(entry.hex, reference);
            const isReference = entry.hex === reference;
            return (
              <li
                key={i}
                className="flex items-center gap-1.5 rounded-md border border-border/50 bg-card/40 px-1.5 py-1"
              >
                <input
                  type="color"
                  value={entry.hex}
                  onChange={(e) => update(i, { hex: e.target.value })}
                  aria-label={`${entry.name} colour`}
                  className="h-6 w-6 shrink-0 cursor-pointer rounded border border-border/60 bg-transparent p-0"
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <input
                    value={entry.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    aria-label="Swatch name"
                    className="min-w-0 bg-transparent text-[11px] focus-visible:outline-none"
                  />
                  <span className="font-mono text-[9.5px] text-muted-foreground/70">
                    {entry.hex}
                  </span>
                </div>

                {/* Contrast against the reference. The reference itself shows
                    a marker instead of a 1:1 ratio, which says nothing. */}
                {isReference ? (
                  <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">
                    ref
                  </span>
                ) : (
                  <span
                    className="shrink-0 rounded px-1 py-0.5 text-[9px] font-medium tabular-nums"
                    style={{
                      background: entry.hex,
                      color: readableOn(entry.hex),
                    }}
                    title={`${formatRatio(verdict.ratio)} against ${reference} — body ${verdict.normal}, large ${verdict.large}, UI ${verdict.ui}`}
                  >
                    {formatRatio(verdict.ratio)}
                  </span>
                )}
                <span
                  className={cn(
                    "w-7 shrink-0 text-center text-[9px] font-semibold",
                    verdict.normal === "fail"
                      ? "text-muted-foreground/40"
                      : "text-green-500",
                  )}
                  title="WCAG level for body text"
                >
                  {isReference ? "" : verdict.normal === "fail" ? "--" : verdict.normal}
                </span>

                <button
                  type="button"
                  onClick={() => setContrastAgainst(entry.hex)}
                  title="Measure the others against this one"
                  className="shrink-0 rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                >
                  <Icon name="pin" size="xs" />
                </button>
                <button
                  type="button"
                  onClick={() => applyHarmony(entry.hex)}
                  title={`Add a ${HARMONY_LABELS[harmonyKind].toLowerCase()} set built from this colour`}
                  className="shrink-0 rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                >
                  <Icon name="magic" size="xs" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  title="Remove"
                  className="shrink-0 rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                >
                  <Icon name="close" size="xs" />
                </button>
              </li>
            );
          })}
        </ul>

        {entries.length === 0 && (
          <p className="p-3 text-center text-[11px] text-muted-foreground/60">
            No colours. Seed one from the theme, or add a swatch.
          </p>
        )}
      </div>

      {/* Export */}
      <div className="shrink-0 border-t border-border/50 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          {PALETTE_FORMATS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={format === f}
              onClick={() => setFormat(f)}
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[10.5px] transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
                format === f
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {PALETTE_FORMAT_LABELS[f]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void copy()}
            className="ml-auto flex items-center gap-1 rounded-md border border-border/60 bg-card px-2 py-0.5 text-[10.5px] transition-colors hover:border-border hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
          >
            <Icon name="copy" size="xs" />
            Copy
          </button>
          {workspaceRoot && (
            <button
              type="button"
              onClick={() => void save()}
              title={`Write palette.${PALETTE_FILE_EXTENSIONS[format]} into ${workspaceRoot}`}
              className="flex items-center gap-1 rounded-md border border-border/60 bg-card px-2 py-0.5 text-[10.5px] transition-colors hover:border-border hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
            >
              <Icon name="download" size="xs" />
              Save
            </button>
          )}
        </div>

        {status && (
          <p className="mt-1.5 text-[10px] break-words text-muted-foreground">
            {status}
          </p>
        )}

        <pre className="mt-1.5 max-h-24 overflow-auto rounded-md bg-muted/40 p-1.5 text-[9.5px] leading-relaxed text-muted-foreground">
          {output}
        </pre>
      </div>
    </div>
  );
}
