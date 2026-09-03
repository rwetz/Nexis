// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * A live SVG editor with a preview that tells the truth at icon scale.
 *
 * The itch behind it: browser-based SVG editors are bad at the small, precise,
 * icon-scale art this project keeps needing. A preview that only shows the art
 * at 300px is not a preview of an icon — the whole question is whether a
 * 1.5-unit stroke lands on a pixel boundary at 16px. So the preview renders
 * the same source at the real sizes, over a pixel grid, with centre guides.
 *
 * The editor is CodeMirror, which means **pitfall #15 applies**: a CodeMirror
 * instance under `.zoom-content` needs the zoom exemption or clicks land on
 * the wrong line. That exemption is global — `.zoom-content .cm-editor` in
 * `globals.css` — so this inherits it by being an ordinary `.cm-editor`. Do
 * not wrap this in anything that re-introduces a CSS `zoom`.
 */

import { Icon, type IconName } from "@/components/icon";
import { ExportBar } from "./ExportBar";
import { PresetGallery } from "./PresetGallery";
import { ShapeGenerator } from "./ShapeGenerator";
import { SvgCanvas } from "./SvgCanvas";
import { cn } from "@/lib/utils";
import {
  getCachedEditorTheme,
  loadEditorTheme,
} from "@/modules/editor/lib/themes";
import { buildSharedExtensions } from "@/modules/editor/lib/extensions";
import { usePreferencesStore } from "@/modules/settings/preferences";
import CodeMirror from "@uiw/react-codemirror";
import { html } from "@codemirror/lang-html";
import { useEffect, useMemo, useState } from "react";
import { looksLikeSvg } from "./lib/svgExport";
import { sanitizeSvgForPreview } from "./lib/svgSanitize";
import {
  formatBytes,
  optimizeSvg,
  savingsPercent,
  type OptimizeResult,
} from "./lib/svgOptimize";

const STARTER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
     fill="none" stroke="currentColor" stroke-width="1.5"
     stroke-linecap="round" stroke-linejoin="round">
  <rect x="3" y="3" width="18" height="18" rx="4" />
  <path d="M8 12 H16" />
  <path d="M12 8 V16" />
</svg>`;

/** The sizes an icon is actually judged at. */
const PREVIEW_SIZES = [16, 24, 32, 64] as const;

const STORAGE_KEY = "nexis:svg-playground:source";

function loadSource(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? STARTER;
  } catch {
    return STARTER;
  }
}

type Props = {
  /** `row` puts the preview beside the code; `col` stacks it underneath. */
  layout: "row" | "col";
  /** Where "Save" writes. Null hides the control — see ExportBar. */
  workspaceRoot: string | null;
};

/**
 * The four ways in. They are tabs over one document rather than four modes:
 * every pane reads and writes the same `source`, so a shape can be generated,
 * dragged on the canvas and then hand-tuned in the code without any of them
 * owning a copy.
 */
type LeftPane = "source" | "canvas" | "shapes" | "presets";

const LEFT_PANES: readonly [LeftPane, IconName, string][] = [
  ["source", "code", "Source"],
  ["canvas", "cursor", "Canvas"],
  ["shapes", "brush", "Shapes"],
  ["presets", "grid", "Presets"],
];

export function SvgPlayground({ layout, workspaceRoot }: Props) {
  // Lazy initialiser: `useState(f())` would re-read localStorage on every
  // render and keep only the first result.
  const [source, setSource] = useState<string>(loadSource);
  const [showGrid, setShowGrid] = useState(true);
  const [leftPane, setLeftPane] = useState<LeftPane>("source");
  const [optimized, setOptimized] = useState<OptimizeResult | null>(null);

  const editorThemeId = usePreferencesStore((s) => s.editorTheme);
  const [themeExt, setThemeExt] = useState(() =>
    getCachedEditorTheme(editorThemeId),
  );
  useEffect(() => {
    let cancelled = false;
    void loadEditorTheme(editorThemeId).then((ext) => {
      if (!cancelled) setThemeExt(ext);
    });
    return () => {
      cancelled = true;
    };
  }, [editorThemeId]);

  // SVG is XML; the HTML grammar highlights it correctly and is already a
  // dependency, so this costs nothing over adding an XML mode.
  const extensions = useMemo(() => [...buildSharedExtensions(), html()], []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, source);
    } catch {
      // A full or disabled store is not a reason to break the editor.
    }
  }, [source]);

  const valid = looksLikeSvg(source);
  // The preview renders a sanitized copy; the editor and every export keep the
  // original, so what you copy is what you wrote. See lib/svgSanitize.ts for
  // why inline markup here is a real risk rather than a theoretical one.
  const safe = useMemo(
    () => (valid ? sanitizeSvgForPreview(source) : { svg: "", removed: [] }),
    [source, valid],
  );
  /**
   * Swap the document wholesale. The optimize summary is cleared with it —
   * "38% smaller" left over from the previous document is a number about art
   * that is no longer on screen.
   */
  const replaceSource = (next: string) => {
    setSource(next);
    setOptimized(null);
  };

  const runOptimize = () => {
    const result = optimizeSvg(source);
    setOptimized(result);
    setSource(result.svg);
  };

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full",
        layout === "row" ? "flex-row" : "flex-col",
      )}
    >
      {/* ── Code ─────────────────────────────────────────────────────────── */}
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-col",
          layout === "row"
            ? "flex-1 border-r border-border/60"
            : "flex-1 border-b border-border/60",
        )}
      >
        <div className="flex shrink-0 items-center gap-1.5 border-b border-border/50 px-3 py-1.5">
          {LEFT_PANES.map(([id, icon, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={leftPane === id}
              onClick={() => setLeftPane(id)}
              className={cn(
                "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                leftPane === id
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground/70 hover:text-foreground",
              )}
            >
              <Icon name={icon} size="xs" active={leftPane === id} />
              {label}
            </button>
          ))}
          {leftPane === "source" && !valid && (
            <span className="ml-auto flex items-center gap-1 text-[10px] text-amber-500">
              <Icon name="alert" size="xs" />
              not a complete &lt;svg&gt; document
            </span>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {leftPane === "canvas" ? (
            <SvgCanvas source={source} onChange={replaceSource} />
          ) : leftPane === "shapes" ? (
            <ShapeGenerator
              onInsert={(generated) => {
                replaceSource(generated);
                setLeftPane("source");
              }}
            />
          ) : leftPane === "presets" ? (
            <PresetGallery
              onInsert={(generated) => {
                replaceSource(generated);
                setLeftPane("canvas");
              }}
            />
          ) : (
          <CodeMirror
            value={source}
            onChange={setSource}
            theme={themeExt ?? "dark"}
            extensions={extensions}
            height="100%"
            className="h-full"
            basicSetup={{
              lineNumbers: true,
              foldGutter: false,
              highlightActiveLine: false,
              highlightActiveLineGutter: false,
              searchKeymap: true,
            }}
          />
          )}
        </div>
      </div>

      {/* ── Preview + controls ───────────────────────────────────────────── */}
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-col",
          layout === "row" ? "w-[300px] shrink-0" : "h-[300px] shrink-0",
        )}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-1.5">
          <Icon name="image" size="sm" className="text-muted-foreground" />
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
            Preview
          </span>
          <button
            type="button"
            aria-pressed={showGrid}
            onClick={() => setShowGrid((v) => !v)}
            title="Toggle the pixel grid and centre guides"
            className={cn(
              "ml-auto rounded p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              showGrid
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon name="grid" size="sm" active={showGrid} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {valid ? (
            <div className="flex flex-wrap items-end gap-3">
              {PREVIEW_SIZES.map((size) => (
                <div key={size} className="flex flex-col items-center gap-1">
                  <div
                    className="relative text-foreground"
                    style={{ width: size, height: size }}
                  >
                    {showGrid && (
                      <>
                        {/* One grid square per SVG user unit at this scale,
                            so the question "does this stroke land on a pixel
                            boundary at 16px" is answerable by looking. */}
                        <div
                          aria-hidden
                          className="pointer-events-none absolute inset-0 opacity-40"
                          style={{
                            backgroundSize: `${size / 6}px ${size / 6}px`,
                            backgroundImage:
                              "linear-gradient(to right, var(--border) 1px, transparent 1px)," +
                              "linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
                          }}
                        />
                        <div
                          aria-hidden
                          className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-primary/40"
                        />
                        <div
                          aria-hidden
                          className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-primary/40"
                        />
                      </>
                    )}
                    {/* Sanitized, not raw: SVG can carry script, and this
                        renders inside a webview that has window.__TAURI__. */}
                    <div
                      className="absolute inset-0 [&>svg]:h-full [&>svg]:w-full"
                      dangerouslySetInnerHTML={{ __html: safe.svg }}
                    />
                  </div>
                  <span className="text-[9.5px] tabular-nums text-muted-foreground/70">
                    {size}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              The preview renders once the source is a complete
              {" "}<code className="text-[10.5px]">&lt;svg&gt;…&lt;/svg&gt;</code>{" "}
              document.
            </p>
          )}
        </div>

        {safe.removed.length > 0 && (
          <div className="shrink-0 border-t border-border/50 bg-amber-500/[0.08] px-3 py-1.5">
            <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-amber-600 dark:text-amber-400">
              <Icon name="security" size="xs" className="mt-px shrink-0" />
              <span>
                The preview is not rendering {safe.removed.join(", ")} — your
                source is unchanged and exports keep it.
              </span>
            </p>
          </div>
        )}

        {/* ── Optimize ───────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-border/50 px-3 py-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={runOptimize}
              disabled={!valid}
              className={cn(
                "flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-2 py-1 text-[11px] transition-colors",
                "hover:border-border hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <Icon name="flash" size="xs" />
              Optimize
            </button>
            {optimized && (
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {formatBytes(optimized.beforeBytes)} →{" "}
                <span className="text-foreground">
                  {formatBytes(optimized.afterBytes)}
                </span>{" "}
                ({savingsPercent(optimized)}% smaller)
              </span>
            )}
          </div>
          {optimized && optimized.applied.length > 0 && (
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/70">
              {optimized.applied.join("; ")}.
            </p>
          )}
        </div>

        <ExportBar source={source} valid={valid} workspaceRoot={workspaceRoot} />
      </div>
    </div>
  );
}
