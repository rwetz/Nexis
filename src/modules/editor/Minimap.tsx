// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { cn } from "@/lib/utils";
import type { EditorView } from "@codemirror/view";
import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  view: EditorView | undefined;
  className?: string;
};

type MinimapState = {
  lines: string[];
  viewportTop: number;
  viewportHeight: number;
};

function getMinimapState(view: EditorView): MinimapState {
  const doc = view.state.doc;
  const lines: string[] = [];
  for (let i = 1; i <= doc.lines; i++) {
    lines.push(doc.line(i).text);
  }
  const dom = view.scrollDOM;
  const totalHeight = Math.max(dom.scrollHeight, 1);
  return {
    lines,
    viewportTop: dom.scrollTop / totalHeight,
    viewportHeight: Math.min(1, dom.clientHeight / totalHeight),
  };
}

function lineClass(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("*")) {
    return "bg-muted-foreground/25";
  }
  return "bg-foreground/30";
}

export function Minimap({ view, className }: Props) {
  const [state, setState] = useState<MinimapState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const refresh = useCallback(() => {
    if (!view) return;
    setState(getMinimapState(view));
  }, [view]);

  useEffect(() => {
    if (!view) return;
    refresh();
    const interval = setInterval(refresh, 200);
    const onScroll = () => refresh();
    view.scrollDOM.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearInterval(interval);
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
      {/* Line strips */}
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
