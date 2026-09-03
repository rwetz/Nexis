// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Getting art out of the playground: to the clipboard, or to a real file.
 *
 * The pack could previously only put text on the clipboard, which made it the
 * one part of the Art preset that never touched the filesystem — despite that
 * preset being scoped to "source control, file manipulation, art". Saving is
 * the half that makes the rest worth having.
 *
 * ## PNG is not just a fourth format
 *
 * The three text formats are pure string transforms of the source. PNG is a
 * *render*, and rendering happens in an isolated document where `currentColor`
 * and `var(--…)` do not resolve — see `lib/raster.ts`. That is why this bar
 * grows a colour control the moment PNG is selected: themed art would
 * otherwise export as black-on-transparent, which looks correct on a light
 * background and is invisible on a dark one, with nothing saying why.
 *
 * The colour defaults to the *rendered* value of the preview's own
 * `--foreground`, so the obvious case — "export this icon the way it looks
 * right now" — needs no decision from the user.
 */

import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { native } from "@/modules/ai/lib/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EXPORT_LABELS,
  formatFor,
  type ExportFormat,
} from "./lib/svgExport";
import {
  exportFileName,
  intrinsicSize,
  needsColorResolution,
  svgToPngBlob,
  svgToPngBytes,
} from "./lib/raster";

/** Text formats plus the one that is a render. */
type OutputFormat = ExportFormat | "png";

const OUTPUT_LABELS: Record<OutputFormat, string> = {
  ...EXPORT_LABELS,
  png: "PNG",
};

/** Multipliers over the document's intrinsic size. */
const SCALES = [1, 2, 3, 4] as const;

type Status = { kind: "ok" | "error"; text: string } | null;

type Props = {
  source: string;
  valid: boolean;
  /** Where saving writes. Null hides the save control. */
  workspaceRoot: string | null;
};

export function ExportBar({ source, valid, workspaceRoot }: Props) {
  const [format, setFormat] = useState<OutputFormat>("svg");
  const [scale, setScale] = useState<number>(2);
  const [stem, setStem] = useState("icon");
  const [color, setColor] = useState("#e4e4e7");
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const statusTimer = useRef(0);

  // Seed the export colour from the theme's own foreground, resolved to a real
  // value — the raster path cannot read a custom property, so this is the one
  // place the current theme can be captured before that door closes.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const resolved = getComputedStyle(el).color;
    if (resolved) setColor(rgbToHex(resolved) ?? resolved);
  }, []);

  useEffect(() => () => window.clearTimeout(statusTimer.current), []);

  const say = useCallback((kind: "ok" | "error", text: string) => {
    setStatus({ kind, text });
    window.clearTimeout(statusTimer.current);
    // Errors stay put: a save that failed is worth reading twice, and a
    // message that vanishes while you are still looking at it is worse than
    // none. Successes are self-evident and clear themselves.
    if (kind === "ok") {
      statusTimer.current = window.setTimeout(() => setStatus(null), 2600);
    }
  }, []);

  const isPng = format === "png";
  const textOutput = useMemo(
    () => (valid && !isPng ? formatFor(source, format as ExportFormat) : ""),
    [source, format, valid, isPng],
  );

  const size = useMemo(() => intrinsicSize(source), [source]);
  const themed = useMemo(() => needsColorResolution(source), [source]);

  const copy = useCallback(async () => {
    if (!valid) return;
    setBusy(true);
    try {
      if (isPng) {
        const blob = await svgToPngBlob(source, { scale, color });
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        say("ok", "PNG copied");
      } else {
        await navigator.clipboard.writeText(textOutput);
        say("ok", "Copied");
      }
    } catch (e) {
      say("error", `Copy failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [color, isPng, say, scale, source, textOutput, valid]);

  const save = useCallback(async () => {
    if (!valid || !workspaceRoot) return;
    setBusy(true);
    try {
      const name = exportFileName(stem, isPng ? "png" : "svg");
      // The root is already slash-normalized everywhere it is stored
      // (stripVerbatimPrefix, pitfall #23), so a plain join is correct and a
      // second path helper would only be a second thing to keep in step.
      const path = `${workspaceRoot.replace(/\/+$/, "")}/${name}`;
      if (isPng) {
        await native.writeFileBytes(
          path,
          await svgToPngBytes(source, { scale, color }),
        );
      } else {
        // The raw source, never the JSX or data-URI form: those are for
        // pasting into code, and neither is a valid .svg file.
        await native.writeFile(path, source);
      }
      say("ok", `Saved ${name}`);
    } catch (e) {
      say("error", `Save failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [color, isPng, say, scale, source, stem, valid, workspaceRoot]);

  return (
    <div
      ref={rootRef}
      className="shrink-0 border-t border-border/50 px-3 py-2 text-foreground"
    >
      <div className="flex flex-wrap items-center gap-1">
        {(Object.keys(OUTPUT_LABELS) as OutputFormat[]).map((f) => (
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
            {OUTPUT_LABELS[f]}
          </button>
        ))}

        <button
          type="button"
          onClick={() => void copy()}
          disabled={!valid || busy}
          className={cn(
            "ml-auto flex items-center gap-1 rounded-md border border-border/60 bg-card px-2 py-0.5 text-[10.5px] transition-colors",
            "hover:border-border hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <Icon name="copy" size="xs" />
          Copy
        </button>
      </div>

      {isPng && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground/70">Scale</span>
          {SCALES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={scale === s}
              onClick={() => setScale(s)}
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
                scale === s
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s}x
            </button>
          ))}
          <span className="text-[10px] tabular-nums text-muted-foreground/60">
            {Math.round(size.width * scale)}x{Math.round(size.height * scale)}
          </span>

          {themed && (
            <label className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground/70">
              <span title="A rasterized SVG is an isolated document: currentColor and var(--...) do not resolve in it, so the colour has to be baked in first.">
                Colour
              </span>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-4 w-6 cursor-pointer rounded border border-border/60 bg-transparent p-0"
              />
            </label>
          )}
        </div>
      )}

      {workspaceRoot && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            value={stem}
            onChange={(e) => setStem(e.target.value)}
            spellCheck={false}
            aria-label="File name"
            className="min-w-0 flex-1 rounded-md border border-border/60 bg-background/60 px-1.5 py-0.5 font-mono text-[10px] focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
          />
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
            .{isPng ? "png" : "svg"}
          </span>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!valid || busy}
            title={`Write into ${workspaceRoot}`}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-md border border-border/60 bg-card px-2 py-0.5 text-[10.5px] transition-colors",
              "hover:border-border hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <Icon name="download" size="xs" />
            Save
          </button>
        </div>
      )}

      {status && (
        <p
          className={cn(
            "mt-1.5 text-[10px] leading-relaxed break-words",
            status.kind === "ok" ? "text-muted-foreground" : "text-destructive",
          )}
        >
          {status.text}
        </p>
      )}

      {valid && !isPng && (
        <pre className="mt-1.5 max-h-20 overflow-auto rounded-md bg-muted/40 p-1.5 text-[9.5px] leading-relaxed text-muted-foreground">
          {textOutput}
        </pre>
      )}
    </div>
  );
}

/**
 * `getComputedStyle().color` gives `rgb(…)`; `<input type="color">` accepts
 * only `#rrggbb`. Returns null for anything else (a colour with alpha, a
 * `color()` function) rather than emitting a value the input would reject.
 */
function rgbToHex(value: string): string | null {
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(value);
  if (!m) return null;
  const hex = m
    .slice(1, 4)
    .map((n) => Math.max(0, Math.min(255, Math.round(Number(n))))
      .toString(16)
      .padStart(2, "0"))
    .join("");
  return `#${hex}`;
}
