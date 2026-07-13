// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { cn } from "@/lib/utils";
import type { EditorView } from "@codemirror/view";
import type { Text } from "@codemirror/state";
import { memo, useCallback, useEffect, useRef, useState } from "react";

type Props = {
  view: EditorView | undefined;
  className?: string;
};

type MinimapState = {
  /** Stable reference while the document is unchanged — keyed on doc identity
   * so the memoized line strips skip re-rendering on scroll/interval ticks. */
  lines: string[];
  viewportTop: number;
  viewportHeight: number;
};

function extractLines(doc: Text): string[] {
  const lines: string[] = [];
  for (let i = 1; i <= doc.lines; i++) {
    lines.push(doc.line(i).text);
  }
  return lines;
}

function lineClass(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("*")) {
    return "bg-muted-foreground/25";
  }
  return "bg-foreground/30";
}

/**
 * Line strips, memoized on the `lines` array reference. Extracting every doc
 * line and diffing one div per line used to happen 5×/sec on an interval AND
 * per scroll event — on a 10k-line file that was the biggest editor-side CPU
 * sink. Now it only happens when the document actually changes.
 */
const MinimapLines = memo(function MinimapLines({
  lines,
  lineHeightPx,
}: {
  lines: string[];
  lineHeightPx: number;
}) {
  return (
    <div className="absolute inset-0 flex flex-col py-0.5">
      {lines.map((text, i) => {
        const maxWidth = 48;
        const cls = lineClass(text);
        if (!cls) {
          return (
            <div key={i} style={{ height: `${lineHeightPx}px` }} />
          );
        }
        const contentWidth = Math.min(maxWidth, Math.max(2, (text.trim().length / 80) * maxWidth));
        return (
          <div
            key={i}
            className={cn("rounded-[1px]", cls)}
            style={{ height: `${lineHeightPx}px`, width: `${contentWidth}px`, marginLeft: "2px" }}
          />
        );
      })}
    </div>
  );
});

export function Minimap({ view, className }: Props) {
  const [state, setState] = useState<MinimapState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const lastDocRef = useRef<Text | null>(null);
  const linesRef = useRef<string[]>([]);
  const scrollRaf = useRef<number | null>(null);

  const refresh = useCallback(() => {
    if (!view) return;
    const doc = view.state.doc;
    if (lastDocRef.current !== doc) {
      lastDocRef.current = doc;
      linesRef.current = extractLines(doc);
    }
    const lines = linesRef.current;
    const dom = view.scrollDOM;
    const totalHeight = Math.max(dom.scrollHeight, 1);
    const viewportTop = dom.scrollTop / totalHeight;
    const viewportHeight = Math.min(1, dom.clientHeight / totalHeight);
    // Bail out with the previous state object when nothing changed so the
    // idle interval tick doesn't re-render at all.
    setState((prev) =>
      prev &&
      prev.lines === lines &&
      prev.viewportTop === viewportTop &&
      prev.viewportHeight === viewportHeight
        ? prev
        : { lines, viewportTop, viewportHeight },
    );
  }, [view]);

  useEffect(() => {
    if (!view) return;
    lastDocRef.current = null;
    refresh();
    // Interval catches doc edits (there is no update-listener hook from here);
    // it's cheap now — line extraction only runs when the doc reference moved.
    const interval = setInterval(refresh, 200);
    // Scroll only moves the viewport indicator; coalesce to one refresh per
    // frame instead of one per scroll event.
    const onScroll = () => {
      if (scrollRaf.current !== null) return;
      scrollRaf.current = requestAnimationFrame(() => {
        scrollRaf.current = null;
        refresh();
      });
    };
    view.scrollDOM.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearInterval(interval);
      if (scrollRaf.current !== null) {
        cancelAnimationFrame(scrollRaf.current);
        scrollRaf.current = null;
      }
      view.scrollDOM.removeEventListener("scroll", onScroll);
    };
  }, [view, refresh]);

  const scrollTo = useCallback((e: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
    if (!view || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const totalHeight = view.scrollDOM.scrollHeight;
    view.scrollDOM.scrollTop = ratio * totalHeight - view.scrollDOM.clientHeight / 2;
    refresh();
  }, [view, refresh]);

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    isDragging.current = true;
    scrollTo(e);

    const onMove = (ev: MouseEvent) => { if (isDragging.current) scrollTo(ev); };
    const onUp = () => { isDragging.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [scrollTo]);

  if (!state) return null;

  const { lines, viewportTop, viewportHeight } = state;
  const lineCount = Math.max(lines.length, 1);
  const lineHeightPx = Math.max(1, Math.min(3, 400 / lineCount));

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-[52px] shrink-0 cursor-pointer select-none overflow-hidden",
        "border-l border-border/30 bg-muted/10",
        className,
      )}
      onMouseDown={onMouseDown}
    >
      <MinimapLines lines={lines} lineHeightPx={lineHeightPx} />

      {/* Viewport indicator */}
      <div
        className="absolute left-0 right-0 border border-primary/30 bg-primary/[0.08] pointer-events-none"
        style={{
          top: `${viewportTop * 100}%`,
          height: `${viewportHeight * 100}%`,
        }}
      />
    </div>
  );
}
