// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The whole app-icon set, written into the project, from the mark you already
 * have open.
 *
 * It reads the playground's document rather than owning one — the same
 * composition the Backdrop panel uses for the palette. Three panels now share
 * state through storage keys instead of each growing a copy of the others, and
 * "export the icon I am working on" needs no wiring beyond that.
 *
 * Nearly all of this was already built: `raster.ts` renders each size,
 * `fs_write_file_bytes` writes it, `faviconSet.ts` holds the list and the
 * manifest. This is the panel that puts them in one gesture.
 *
 * ## The two things a hand-rolled favicon set gets wrong
 *
 * 1. **`currentColor` rasterizes to black.** An `<img>`-loaded SVG is an
 *    isolated document, so themed art exports invisible on a dark background.
 *    The colour is resolved into the markup first — see `raster.ts`.
 * 2. **iOS composites nothing behind a home-screen icon.** A transparent
 *    apple-touch-icon lands on the wallpaper and a dark mark disappears. That
 *    one target is always rendered opaque, and the panel says so rather than
 *    letting it be discovered on a phone.
 */

import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { native } from "@/modules/ai/lib/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildHeadSnippet,
  buildManifest,
  FAVICON_TARGETS,
  needsOpaqueBackground,
  plannedFiles,
} from "./lib/faviconSet";
import {
  intrinsicSize,
  needsColorResolution,
  svgToPngBytes,
} from "./lib/raster";
import { looksLikeSvg } from "./lib/svgExport";
import { sanitizeSvgForPreview } from "./lib/svgSanitize";

/** Written by the SVG playground. Read-only here. */
const PLAYGROUND_KEY = "nexis:svg-playground:source";

function readPlaygroundSource(): string {
  try {
    return localStorage.getItem(PLAYGROUND_KEY) ?? "";
  } catch {
    return "";
  }
}

type Props = {
  workspaceRoot: string | null;
};

type Status = { kind: "ok" | "error"; text: string } | null;

/**
 * The raster scale that lands a document on an exact pixel count.
 *
 * Each target is a size, not a multiplier, so this divides through the
 * document's own dimensions — a 240-unit mark and a 24-unit one must both come
 * out at exactly 180px. `intrinsicSize` is the one implementation of "how big
 * does this document want to be", shared with the exporter.
 */
function scaleFor(size: number, source: string): number {
  const base = intrinsicSize(source);
  const longest = Math.max(base.width, base.height);
  return longest > 0 ? size / longest : 1;
}

export function FaviconPanel({ workspaceRoot }: Props) {
  const [source, setSource] = useState<string>(readPlaygroundSource);
  const [outDir, setOutDir] = useState<string>("public");
  const [appName, setAppName] = useState("My App");
  const [shortName, setShortName] = useState("App");
  const [color, setColor] = useState("#e4e4e7");
  const [background, setBackground] = useState("#101014");
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // The playground may have changed the document since this panel mounted, and
  // there is no cross-panel event to subscribe to — so refresh is explicit and
  // storage events cover the other-window case.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === PLAYGROUND_KEY) setSource(readPlaygroundSource());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const valid = looksLikeSvg(source);
  const themed = useMemo(() => needsColorResolution(source), [source]);
  const safe = useMemo(
    () => (valid ? sanitizeSvgForPreview(source).svg : ""),
    [source, valid],
  );

  const targetDir = useMemo(() => {
    if (!workspaceRoot) return null;
    const base = workspaceRoot.replace(/\/+$/, "");
    const sub = outDir.trim().replace(/^\/+|\/+$/g, "");
    return sub ? `${base}/${sub}` : base;
  }, [workspaceRoot, outDir]);

  const generate = useCallback(async () => {
    if (!valid || !targetDir) return;
    setBusy(true);
    setStatus(null);
    try {
      // The directory may not exist yet; creating it is idempotent on the
      // backend and cheaper than asking the user to make it first.
      try {
        await native.createDir(targetDir);
      } catch {
        // Already there, which is the common case.
      }

      // The vector original goes first: it is the one browsers prefer, and
      // every PNG below is a fallback for the ones that cannot use it.
      await native.writeFile(`${targetDir}/favicon.svg`, source);

      for (const target of FAVICON_TARGETS) {
        const bytes = await svgToPngBytes(source, {
          scale: scaleFor(target.size, source),
          color: themed ? color : null,
          // Only iOS needs the opaque plate; giving every size a background
          // would put a coloured square in every browser tab.
          background: needsOpaqueBackground(target) ? background : null,
        });
        await native.writeFileBytes(`${targetDir}/${target.name}`, bytes);
      }

      await native.writeFile(
        `${targetDir}/site.webmanifest`,
        buildManifest({
          name: appName,
          shortName,
          themeColor: color,
          backgroundColor: background,
        }),
      );

      setStatus({
        kind: "ok",
        text: `Wrote ${plannedFiles().length} files to ${targetDir}`,
      });
    } catch (e) {
      setStatus({ kind: "error", text: `Failed: ${String(e)}` });
    } finally {
      setBusy(false);
    }
  }, [appName, background, color, shortName, source, targetDir, themed, valid]);

  const copyHead = () => {
    void navigator.clipboard.writeText(buildHeadSnippet()).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <Icon name="rocket" className="text-muted-foreground" />
        <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          Favicon Set
        </span>
        <button
          type="button"
          onClick={() => setSource(readPlaygroundSource())}
          title="Re-read the SVG playground's current document"
          className="ml-auto rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
        >
          <Icon name="refresh" size="xs" />
        </button>
      </div>

      {/* Source preview */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border/50 px-3 py-2">
        {valid ? (
          <>
            <div
              className="size-8 shrink-0 text-foreground [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: safe }}
            />
            <p className="text-[10px] leading-relaxed text-muted-foreground/70">
              From the SVG playground.
            </p>
          </>
        ) : (
          <p className="text-[10.5px] leading-relaxed text-muted-foreground">
            Draw or paste a mark in the SVG playground first — this exports the
            document that panel is holding.
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {/* Metadata */}
        <div className="flex flex-col gap-2">
          <Field label="Folder" hint="Relative to the workspace root">
            <input
              value={outDir}
              onChange={(e) => setOutDir(e.target.value)}
              spellCheck={false}
              className="w-full rounded-md border border-border/60 bg-background/60 px-1.5 py-0.5 font-mono text-[10px] focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
            />
          </Field>
          <Field label="App name">
            <input
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              className="w-full rounded-md border border-border/60 bg-background/60 px-1.5 py-0.5 text-[10.5px] focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
            />
          </Field>
          <Field label="Short name" hint="Shown under a home-screen icon">
            <input
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              className="w-full rounded-md border border-border/60 bg-background/60 px-1.5 py-0.5 text-[10.5px] focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
            />
          </Field>
          <div className="flex items-center gap-3">
            {themed && (
              <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span title="A rasterized SVG is an isolated document: currentColor does not resolve in it, so the colour is baked in first.">
                  Mark
                </span>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-5 w-7 cursor-pointer rounded border border-border/60 bg-transparent p-0"
                />
              </label>
            )}
            <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span title="iOS composites nothing behind a home-screen icon, so the apple-touch-icon is always rendered on this colour.">
                iOS plate
              </span>
              <input
                type="color"
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                className="h-5 w-7 cursor-pointer rounded border border-border/60 bg-transparent p-0"
              />
            </label>
          </div>
        </div>

        {/* The plan */}
        <ul className="mt-3 flex flex-col gap-1">
          {FAVICON_TARGETS.map((t) => (
            <li
              key={t.name}
              className="flex items-baseline gap-2 rounded border border-border/40 bg-card/30 px-2 py-1"
            >
              <span className="w-9 shrink-0 text-right font-mono text-[9.5px] tabular-nums text-muted-foreground">
                {t.size}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-[10px]">
                  {t.name}
                </span>
                <span className="block text-[9px] leading-relaxed text-muted-foreground/60">
                  {t.why}
                </span>
              </span>
              {needsOpaqueBackground(t) && (
                <span
                  className="shrink-0 rounded bg-muted px-1 text-[8.5px] text-muted-foreground"
                  title="Rendered on the plate colour, because iOS will not"
                >
                  opaque
                </span>
              )}
            </li>
          ))}
        </ul>

        {/* Head snippet */}
        <div className="mt-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground/70">
              Markup for &lt;head&gt;
            </span>
            <button
              type="button"
              onClick={copyHead}
              className="ml-auto flex items-center gap-1 rounded-md border border-border/60 bg-card px-1.5 py-0.5 text-[10px] transition-colors hover:border-border hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
            >
              <Icon name={copied ? "check" : "copy"} size="xs" />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="mt-1 max-h-24 overflow-auto rounded-md bg-muted/40 p-1.5 text-[9px] leading-relaxed text-muted-foreground">
            {buildHeadSnippet()}
          </pre>
        </div>
      </div>

      <div className="shrink-0 border-t border-border/50 px-3 py-2">
        <button
          type="button"
          onClick={() => void generate()}
          disabled={!valid || !targetDir || busy}
          title={targetDir ? `Write into ${targetDir}` : "Open a workspace first"}
          className={cn(
            "flex w-full items-center justify-center gap-1.5 rounded-md bg-primary/90 py-1.5 text-[11.5px] font-medium text-primary-foreground transition-colors",
            "hover:bg-primary focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <Icon name="download" size="xs" />
          {busy ? "Writing…" : `Generate ${plannedFiles().length} files`}
        </button>
        {status && (
          <p
            className={cn(
              "mt-1.5 text-[10px] break-words",
              status.kind === "ok" ? "text-muted-foreground" : "text-destructive",
            )}
          >
            {status.text}
          </p>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-0.5" title={hint}>
      <span className="text-[10px] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
