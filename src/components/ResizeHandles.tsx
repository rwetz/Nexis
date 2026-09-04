// Borderless windows (Linux/Windows) have no native frame, so the webview
// owns the whole surface and edge hover shows the default cursor. These
// invisible strips restore the platform feel: proper resize cursors (the
// custom PNG set via the .cursor-* utilities) and OS-driven resize via
// startResizeDragging.
import { USE_CUSTOM_WINDOW_CONTROLS } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { getCurrentWindow, type Window } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";

const EDGE = 5; // px hit-zone on edges
const CORNER = 14; // px hit-zone on corners

// The union of direction strings startResizeDragging accepts; the package
// declares this type but doesn't export it.
type ResizeDirection = Parameters<Window["startResizeDragging"]>[0];

type Zone = {
  dir: ResizeDirection;
  className: string;
  style: React.CSSProperties;
};

const ZONES: Zone[] = [
  { dir: "North", className: "cursor-ns-resize", style: { top: 0, left: CORNER, right: CORNER, height: EDGE } },
  { dir: "South", className: "cursor-ns-resize", style: { bottom: 0, left: CORNER, right: CORNER, height: EDGE } },
  { dir: "West", className: "cursor-ew-resize", style: { left: 0, top: CORNER, bottom: CORNER, width: EDGE } },
  { dir: "East", className: "cursor-ew-resize", style: { right: 0, top: CORNER, bottom: CORNER, width: EDGE } },
  { dir: "NorthWest", className: "cursor-nwse-resize", style: { top: 0, left: 0, width: CORNER, height: CORNER } },
  { dir: "NorthEast", className: "cursor-nesw-resize", style: { top: 0, right: 0, width: CORNER, height: CORNER } },
  { dir: "SouthWest", className: "cursor-nesw-resize", style: { bottom: 0, left: 0, width: CORNER, height: CORNER } },
  { dir: "SouthEast", className: "cursor-nwse-resize", style: { bottom: 0, right: 0, width: CORNER, height: CORNER } },
];

export function ResizeHandles() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!USE_CUSTOM_WINDOW_CONTROLS) return;
    const w = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void w.isMaximized().then(setMaximized);
    void w
      .onResized(() => void w.isMaximized().then(setMaximized))
      .then((un) => {
        unlisten = un;
      });
    return () => unlisten?.();
  }, []);

  if (!USE_CUSTOM_WINDOW_CONTROLS || maximized) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50" aria-hidden="true">
      {ZONES.map((z) => (
        <div
          key={z.dir}
          className={cn("pointer-events-auto absolute", z.className)}
          style={z.style}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            void getCurrentWindow().startResizeDragging(z.dir);
          }}
        />
      ))}
    </div>
  );
}
