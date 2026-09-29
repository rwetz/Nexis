// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * `<ShaderOrb variant="glass" state="thinking" size={44} />`.
 *
 * Shaped after shadercn's `canvas.tsx` (MIT, Copyright (c) 2026 Shadcn Labs):
 * props feed a mutable input the frame loop reads, so changing state never
 * rebuilds anything. Only the variant, the theme, `still` and a context loss
 * start a new renderer.
 *
 * It degrades rather than disappearing. No WebGL2, a shader that fails to
 * compile, or a lost context all show a CSS disc in the orb's own colours;
 * `prefers-reduced-motion` draws one settled frame and no loop.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
// Imported from its own file, not the theme index: through the index, this
// lazy chunk and the theme module import each other across chunks, which
// Rollup warns can break execution order.
import { useTheme } from "@/modules/theme/ThemeProvider";
import { createOrbDrive, type DriveInput } from "./drive";
import { createOrbRenderer } from "./renderer";
import { snapshotOrb } from "./snapshot";
import { baseColorsFor } from "./themeColor";
import type { OrbState } from "./types";
import { orbVariant } from "./variants";

type Props = {
  variant: string;
  state?: OrbState;
  size: number;
  /** Draw one settled frame and stop, e.g. for a gallery tile that is not hovered. */
  still?: boolean;
  className?: string;
  style?: CSSProperties;
  label?: string;
};

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

export function ShaderOrb({ variant, state = "idle", size, still = false, className, style, label }: Props) {
  const def = orbVariant(variant);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { themeId, resolvedMode } = useTheme();
  const [painted, setPainted] = useState(false);
  const [failed, setFailed] = useState(false);
  // Bumped on a context loss, so the effect below builds a fresh renderer.
  const [generation, setGeneration] = useState(0);
  // Losses across every renderer this orb has had, not per renderer: a count
  // kept inside the effect reset with each rebuild, so a GPU that kept
  // dropping contexts would have been rebuilt forever.
  const losses = useRef(0);

  // Resolved against the live theme; recomputed when the theme changes.
  const baseColors = useMemo(
    () => (def ? baseColorsFor(def) : {}),
    // themeId/resolvedMode are the signal that the CSS variables changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [def, themeId, resolvedMode],
  );

  const input = useRef<DriveInput>({ state, baseColors });
  useEffect(() => {
    input.current = { state, baseColors };
  }, [state, baseColors]);

  const staticFrame = still || prefersReducedMotion();

  // A still frame never gets a context of its own: it comes from the shared
  // snapshot renderer as an image (see snapshot.ts for why).
  const [stillSrc, setStillSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!def || !staticFrame) return;
    let cancelled = false;
    setFailed(false);
    const px = size * Math.min(window.devicePixelRatio || 1, 2);
    snapshotOrb(def, state, baseColors, px).then(
      (src) => {
        if (!cancelled) setStillSrc(src);
      },
      (e: unknown) => {
        console.warn("[nexis] orb still failed:", e);
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [def, staticFrame, state, baseColors, size]);

  // Every renderer gets a brand-new <canvas>. A canvas has exactly one WebGL
  // context for its whole life, and `dispose` deliberately loses the old
  // renderer's context to stay under the webview's context cap, so a new
  // renderer on the same element would be handed that dead context. The
  // symptom was an orb dropping to its fallback the moment it was selected
  // in Settings (still to live is a new renderer).
  const canvasKey = `${variant}:${generation}`;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !def || staticFrame) return;
    setPainted(false);
    setFailed(false);
    const renderer = createOrbRenderer({
      canvas,
      variant: def,
      drive: createOrbDrive(def),
      input: () => input.current,
      onFirstFrame: () => setPainted(true),
      onLost: () => {
        // One retry: a context evicted by the webview's context cap usually
        // comes back. A second loss is treated as a real failure.
        losses.current += 1;
        if (losses.current > 1) setFailed(true);
        else setGeneration((g) => g + 1);
      },
    });
    renderer.ready.catch((e: unknown) => {
      console.warn("[nexis] orb failed to start:", e);
      setFailed(true);
    });
    return renderer.dispose;
    // canvasKey changes exactly when a new renderer is needed, and is also
    // what gives that renderer a fresh canvas (see above). Colours are not
    // part of it: the loop reads them through `input`, so a theme change
    // eases a live orb instead of rebuilding it.
  }, [def, canvasKey, staticFrame]);

  if (!def) return null;
  const [a, b] = Object.values(baseColors);
  return (
    <div
      role="img"
      aria-label={label ?? `${def.label} orb, ${state}`}
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size, ...style }}
    >
      {failed ? (
        <div
          className="absolute inset-[8%] rounded-full"
          style={{ background: `radial-gradient(circle at 35% 30%, ${a ?? "#fff"}, ${b ?? a ?? "#888"} 70%)` }}
        />
      ) : staticFrame ? (
        stillSrc ? <img src={stillSrc} alt="" draggable={false} className="block size-full" /> : null
      ) : (
        <canvas
          key={canvasKey}
          ref={canvasRef}
          className="block size-full transition-opacity duration-300"
          style={{ opacity: painted ? 1 : 0 }}
        />
      )}
    </div>
  );
}
