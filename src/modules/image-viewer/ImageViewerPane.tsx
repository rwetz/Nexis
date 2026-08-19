// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/lib/utils";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";

const IMAGE_EXTS = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif|tiff?)$/i;

export function isImagePath(path: string): boolean {
  return IMAGE_EXTS.test(path);
}

type Dims = { w: number; h: number };

type Props = {
  path: string;
  visible: boolean;
};

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 32;
const ZOOM_STEP = 0.1;

function clampZoom(z: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

function fmtZoom(z: number): string {
  return `${Math.round(z * 100)}%`;
}


export function ImageViewerPane({ path, visible }: Props) {
  const [zoom, setZoom] = useState(1);
  const [fitMode, setFitMode] = useState<"fit" | "actual">("fit");
  const [dims, setDims] = useState<Dims | null>(null);
  const [loadErr, setLoadErr] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Normalise to forward slashes — convertFileSrc on Windows does not handle
  // backslashes, producing a 404 from the asset:// protocol handler.
  const src = convertFileSrc(path.replace(/\\/g, "/"));
  const filename = path.split(/[\\/]/).pop() ?? path;
  const ext = (filename.split(".").pop() ?? "").toUpperCase();

  // Compute fit zoom so image fills the container without cropping
  const computeFitZoom = useCallback((): number => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img || !dims) return 1;
    const { clientWidth: cw, clientHeight: ch } = container;
    // Leave a small margin
    const scaleW = (cw - 32) / dims.w;
    const scaleH = (ch - 32) / dims.h;
    return Math.min(1, Math.min(scaleW, scaleH));
  }, [dims]);

  // Apply fit zoom whenever fit mode is active or window resizes
  useEffect(() => {
    if (fitMode !== "fit" || !dims) return;
    const apply = () => setZoom(computeFitZoom());
    apply();
    const ro = new ResizeObserver(apply);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [fitMode, dims, computeFitZoom]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setDims({ w: img.naturalWidth, h: img.naturalHeight });
    setLoadErr(false);
  };

  const handleImageError = () => setLoadErr(true);

  // Register wheel as a non-passive native listener so preventDefault() works.
  // React's synthetic onWheel is passive by default in Chromium-based WebViews,
  // which silently ignores preventDefault() and lets the container scroll.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: globalThis.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setFitMode("actual");
      setZoom((z) => clampZoom(z + delta * (z < 0.5 ? 0.5 : 1)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []); // containerRef.current is stable after mount

  const zoomIn = () => {
    setFitMode("actual");
    setZoom((z) => clampZoom(z + ZOOM_STEP * (z < 0.5 ? 0.5 : 1)));
  };

  const zoomOut = () => {
    setFitMode("actual");
    setZoom((z) => clampZoom(z - ZOOM_STEP * (z < 0.5 ? 0.5 : 1)));
  };

  const toggleFit = () => {
    if (fitMode === "fit") {
      setFitMode("actual");
      setZoom(1);
    } else {
      setFitMode("fit");
    }
  };

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-md border border-border/60 bg-background",
        !visible && "pointer-events-none",
      )}
    >
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 bg-card/60 px-3 py-1">
        <div className="flex min-w-0 items-center gap-2">
          <Icon name="image" className="shrink-0 text-muted-foreground/60" />
          <span className="truncate font-mono text-[10.5px] text-muted-foreground/70">
            {filename}
          </span>
          {dims && (
            <span className="shrink-0 text-[10px] text-muted-foreground/40">
              {dims.w} × {dims.h} · {ext}
            </span>
          )}
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-0.5">
          <ToolbarBtn icon={"zoom-out"} label="Zoom out" onClick={zoomOut} />
          <button
            type="button"
            onClick={toggleFit}
            className={cn(
              "flex h-6 min-w-[46px] cursor-pointer items-center justify-center rounded px-1.5",
              "text-[10.5px] font-medium tabular-nums outline-none transition-colors",
              "focus-visible:ring-1 focus-visible:ring-primary/40",
              fitMode === "fit"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
            )}
            title={fitMode === "fit" ? "Switch to actual size" : "Fit to window"}
          >
            {fitMode === "fit" ? "Fit" : fmtZoom(zoom)}
          </button>
          <ToolbarBtn icon={"zoom-in"} label="Zoom in" onClick={zoomIn} />
          <ToolbarBtn
            icon={"expand"}
            label="Fit to window"
            active={fitMode === "fit"}
            onClick={toggleFit}
          />
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 overflow-auto"
      >
        {loadErr ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-[12px] text-destructive">
              Failed to load image: {filename}
            </p>
          </div>
        ) : (
          <div className="flex min-h-full min-w-full items-center justify-center p-4">
            {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
            <img
              ref={imgRef}
              src={src}
              alt={filename}
              onLoad={handleImageLoad}
              onError={handleImageError}
              draggable={false}
              style={{
                width: dims ? dims.w * zoom : undefined,
                height: dims ? dims.h * zoom : undefined,
                imageRendering: zoom > 3 ? "pixelated" : "auto",
                display: "block",
                userSelect: "none",
              }}
              className="rounded shadow-sm transition-[width,height] duration-75"
            />
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex shrink-0 items-center gap-3 border-t border-border/40 bg-card/40 px-3 py-0.5">
        {dims ? (
          <>
            <span className="text-[10px] text-muted-foreground/50">
              {dims.w} × {dims.h} px
            </span>
            <span className="text-[10px] text-muted-foreground/50">
              {fmtZoom(zoom)}
            </span>
          </>
        ) : (
          <span className="text-[10px] text-muted-foreground/40">Loading…</span>
        )}
      </div>
    </div>
  );
}

function ToolbarBtn({
  icon,
  label,
  active,
  onClick,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[10.5px] outline-none transition-colors",
        "focus-visible:ring-1 focus-visible:ring-primary/40",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
      )}
    >
      <Icon name={icon} />
    </button>
  );
}
