// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * A downloaded welcome background: the loop stored by backgroundLibrary,
 * played muted and looping from a blob: URL. Calls `onMissing` when the
 * background isn't installed (removed in another window) or the webview
 * can't decode it (a Linux WebKitGTK without the GStreamer H.264 plugin), so
 * the welcome screen can fall back to a built-in instead of a blank field.
 */

import { memo, useEffect, useRef, useState } from "react";
import { getInstalled } from "./backgroundLibrary";

function LibraryVideoBackgroundImpl({
  id,
  onMissing,
  className,
}: {
  id: string;
  onMissing: () => void;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let url: string | null = null;
    let live = true;
    getInstalled(id)
      .then((bg) => {
        if (!live) return;
        if (!bg) {
          onMissing();
          return;
        }
        url = URL.createObjectURL(bg.video);
        setSrc(url);
      })
      .catch(() => live && onMissing());
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
      setSrc(null);
    };
    // onMissing is a fresh closure every render; the id is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Stop decoding while the window is hidden, like the canvas backgrounds.
  useEffect(() => {
    const onVis = () => {
      const v = videoRef.current;
      if (!v) return;
      if (document.hidden) v.pause();
      else void v.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  if (!src) return null;
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return (
    <video
      ref={videoRef}
      src={src}
      autoPlay={!reduced}
      loop
      muted
      playsInline
      disablePictureInPicture
      aria-hidden
      onError={onMissing}
      className={className}
    />
  );
}

export const LibraryVideoBackground = memo(LibraryVideoBackgroundImpl);
