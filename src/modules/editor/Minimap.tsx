// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { cn } from "@/lib/utils";
import { canvasBackingScale } from "@/lib/canvas";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { EditorView } from "@codemirror/view";
import type { Text } from "@codemirror/state";
import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  view: EditorView | undefined;
  className?: string;
};

// ─── Update plumbing ───────────────────────────────────────────────────────
// The minimap is a DOM sibling of the editor, not an extension — so doc
// changes are delivered through this updateListener, which EditorPane
// includes in its (identity-stable) extensions array. Each mounted Minimap
// registers a callback; with none mounted the listener is a no-op. This
// replaces the old 200 ms polling interval outright.

const listeners = new Set<(view: EditorView) => void>();

export const minimapUpdateExtension = EditorView.updateListener.of((u) => {
  if (u.docChanged || u.geometryChanged) {
    for (const l of listeners) l(u.view);
  }
});

// ─── Rendering ─────────────────────────────────────────────────────────────

const WIDTH_PX = 52;
const CONTENT_MAX_PX = 48;

function extractLines(doc: Text): string[] {
  const lines: string[] = [];
  for (let i = 1; i <= doc.lines; i++) {
    lines.push(doc.line(i).text);
  }
  return lines;
}

function isCommentish(trimmed: string): boolean {
  return (
    trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("*")
  );
}

/**
 * Minimap as a single `<canvas>`: one fillRect per non-empty line, redrawn
 * only when the document (or geometry) actually changes, via
 * `minimapUpdateExtension`. Replaces the per-line-div implementation and its
 * 200 ms interval — on a 10k-line file that was 10k DOM nodes diffed on a
 * timer; now it's one canvas repaint on edit and zero work at idle. The
 * viewport indicator stays a div and moves on scroll without repainting.
 */
export function Minimap({ view, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDragging = useRef(false);
  const lastDocRef = useRef<Text | null>(null);
  const linesRef = useRef<string[]>([]);
  const drawRaf = useRef<number | null>(null);
  const scrollRaf = useRef<number | null>(null);
  const [viewport, setViewport] = useState<{ top: number; h: number } | null>(
    null,
  );
  // A dependency of `draw`: app zoom changes the effective backing scale
  // without changing any CSS-pixel size, so nothing else would retrigger it.
  const zoomLevel = usePreferencesStore((s) => s.zoomLevel);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!view || !canvas || !container) return;
    const doc = view.state.doc;
    if (lastDocRef.current !== doc) {
      lastDocRef.current = doc;
      linesRef.current = extractLines(doc);
    }
    const lines = linesRef.current;
    const cssH = Math.max(container.clientHeight, 1);
    // dpr × app zoom — see canvasBackingScale. CSS zoom leaves
    // devicePixelRatio alone, so dpr on its own renders the strip soft.
    const scale = canvasBackingScale();
    canvas.width = Math.round(WIDTH_PX * scale);
    canvas.height = Math.round(cssH * scale);
    canvas.style.width = `${WIDTH_PX}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale, scale);
    ctx.clearRect(0, 0, WIDTH_PX, cssH);
    // Resolve the theme's foreground through the container so the strip
    // colors follow light/dark and custom themes without any config.
    const fg = getComputedStyle(container).color;
    const lineHeight = Math.max(1, Math.min(3, 400 / Math.max(lines.length, 1)));
    const stripHeight = Math.max(lineHeight * 0.8, 1);
    ctx.fillStyle = fg;
    for (let i = 0; i < lines.length; i++) {
      const y = 2 + i * lineHeight;
      if (y > cssH) break;
      const trimmed = lines[i].trim();
      if (!trimmed) continue;
      ctx.globalAlpha = isCommentish(trimmed) ? 0.25 : 0.3;
      const w = Math.min(
        CONTENT_MAX_PX,
        Math.max(2, (trimmed.length / 80) * CONTENT_MAX_PX),
      );
      ctx.fillRect(2, y, w, stripHeight);
    }
    ctx.globalAlpha = 1;
  }, [view, zoomLevel]);

  const scheduleDraw = useCallback(() => {
    if (drawRaf.current !== null) return;
    drawRaf.current = requestAnimationFrame(() => {
      drawRaf.current = null;
      draw();
    });
  }, [draw]);

  const updateViewport = useCallback(() => {
    if (!view) return;
    const dom = view.scrollDOM;
    const total = Math.max(dom.scrollHeight, 1);
    const top = dom.scrollTop / total;
    const h = Math.min(1, dom.clientHeight / total);
    setViewport((prev) =>
      prev && prev.top === top && prev.h === h ? prev : { top, h },
    );
  }, [view]);

  useEffect(() => {
    if (!view) return;
    lastDocRef.current = null;
    draw();
    updateViewport();

    // Doc/geometry changes arrive from the CM updateListener; filter to this
    // pane's view (the extension is shared by every editor pane).
    const onUpdate = (v: EditorView) => {
      if (v !== view) return;
      scheduleDraw();
      updateViewport();
    };
    listeners.add(onUpdate);

    // Scroll only moves the indicator — one state write per frame, no repaint.
    const onScroll = () => {
      if (scrollRaf.current !== null) return;
      scrollRaf.current = requestAnimationFrame(() => {
        scrollRaf.current = null;
        updateViewport();
      });
    };
    view.scrollDOM.addEventListener("scroll", onScroll, { passive: true });

    // Container resize (pane splits, window resize) rescales the canvas.
    const ro = new ResizeObserver(() => {
      scheduleDraw();
      updateViewport();
    });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      listeners.delete(onUpdate);
      view.scrollDOM.removeEventListener("scroll", onScroll);
      ro.disconnect();
      if (drawRaf.current !== null) {
        cancelAnimationFrame(drawRaf.current);
        drawRaf.current = null;
      }
      if (scrollRaf.current !== null) {
        cancelAnimationFrame(scrollRaf.current);
        scrollRaf.current = null;
      }
    };
  }, [view, draw, scheduleDraw, updateViewport]);

  const scrollTo = useCallback(
    (e: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
      if (!view || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min(1, (e.clientY - rect.top) / rect.height),
      );
      const totalHeight = view.scrollDOM.scrollHeight;
      view.scrollDOM.scrollTop =
        ratio * totalHeight - view.scrollDOM.clientHeight / 2;
      updateViewport();
    },
    [view, updateViewport],
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      isDragging.current = true;
      scrollTo(e);

      const onMove = (ev: MouseEvent) => {
        if (isDragging.current) scrollTo(ev);
      };
      const onUp = () => {
        isDragging.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [scrollTo],
  );

  if (!view) return null;

  return (
    <div
      ref={containerRef}
      // A supplementary drag-to-scroll surface rendered to canvas. It duplicates
      // the scrollbar and the editor's own keyboard navigation, and the canvas
      // exposes nothing to a screen reader, so the whole thing stays out of the
      // a11y tree instead of becoming an unusable tab stop.
      aria-hidden="true"
      className={cn(
        "relative w-[52px] shrink-0 cursor-pointer select-none overflow-hidden",
        "border-l border-border/30 bg-muted/10",
        className,
      )}
      onMouseDown={onMouseDown}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* Viewport indicator */}
      {viewport && (
        <div
          className="absolute left-0 right-0 border border-primary/30 bg-primary/[0.08] pointer-events-none"
          style={{
            top: `${viewport.top * 100}%`,
            height: `${viewport.h * 100}%`,
          }}
        />
      )}
    </div>
  );
}
