// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { IS_LINUX } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { getCurrentWindow, type Window } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

type ResizeDirection = Parameters<Window["startResizeDragging"]>[0];

// An undecorated GTK window has no resize borders: the invisible grab zone
// around a normal window belongs to the client-side decoration shadow, and
// `decorations: false` (tauri.linux.conf.json) removes it entirely — so the
// compositor has nothing to hit-test at the edges. Windows doesn't need this
// component (tao gives undecorated windows native WM_NCHITTEST resize
// borders) and macOS keeps real decorations, hence the IS_LINUX guard.
//
// These strips are the replacement: invisible fixed-position zones hugging
// the window edges that hand the gesture to the compositor via
// startResizeDragging(). They live OUTSIDE .zoom-content (mounted at the App
// shell root) so app zoom never scales their hit areas.

const EDGE = 5; // px — edge strip thickness
const CORNER = 14; // px — corner square, easier to hit than EDGE×EDGE

type Zone = {
  dir: ResizeDirection;
  cursor: string;
  style: CSSProperties;
};

const ZONES: Zone[] = [
  // Edges, inset by CORNER so the corner zones win at the extremes.
  { dir: "North", cursor: "cursor-ns-resize", style: { top: 0, left: CORNER, right: CORNER, height: EDGE } },
  { dir: "South", cursor: "cursor-ns-resize", style: { bottom: 0, left: CORNER, right: CORNER, height: EDGE } },
  { dir: "West", cursor: "cursor-ew-resize", style: { left: 0, top: CORNER, bottom: CORNER, width: EDGE } },
  { dir: "East", cursor: "cursor-ew-resize", style: { right: 0, top: CORNER, bottom: CORNER, width: EDGE } },
  // Corners.
  { dir: "NorthWest", cursor: "cursor-nwse-resize", style: { top: 0, left: 0, width: CORNER, height: CORNER } },
  { dir: "NorthEast", cursor: "cursor-nesw-resize", style: { top: 0, right: 0, width: CORNER, height: CORNER } },
  { dir: "SouthWest", cursor: "cursor-nesw-resize", style: { bottom: 0, left: 0, width: CORNER, height: CORNER } },
  { dir: "SouthEast", cursor: "cursor-nwse-resize", style: { bottom: 0, right: 0, width: CORNER, height: CORNER } },
];

export function WindowResizeEdges() {
  // When maximized/fullscreen the window can't be edge-resized, and the strips
  // would steal clicks from real UI flush against the screen edge (tabs at the
  // top, scrollbars at the right), so they unmount entirely.
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!IS_LINUX) return;
    const w = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    const update = () => {
      void Promise.all([w.isMaximized(), w.isFullscreen()])
        .then(([max, fs]) => setHidden(max || fs))
        .catch(() => {});
    };
    update();
    void w.onResized(update).then((un) => {
      unlisten = un;
    });
    return () => unlisten?.();
  }, []);

  if (!IS_LINUX || hidden) return null;

  return (
    <>
      {ZONES.map((z) => (
        <div
          key={z.dir}
          aria-hidden
          // pointer-events-auto: Radix modal layers set pointer-events:none
          // on <body>; without the explicit re-enable, opening any dialog
          // would silently kill edge resizing until it closed.
          className={cn("pointer-events-auto fixed z-[9999]", z.cursor)}
          style={z.style}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            void getCurrentWindow()
              .startResizeDragging(z.dir)
              .catch((err) =>
                console.error("[nexis] startResizeDragging failed:", err),
              );
          }}
        />
      ))}
    </>
  );
}
