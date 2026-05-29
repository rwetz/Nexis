import {
  readBgFastPath,
  usePreferencesStore,
} from "@/modules/settings/preferences";
import { BG_OPACITY_RENDER_FACTOR } from "@/modules/settings/store";
import type { AnimatedBgId } from "@/modules/settings/store";
import { useTheme } from "@/modules/theme";
import { getBuiltinTheme } from "@/modules/theme/themes";
import { DEFAULT_THEME_ID } from "@/modules/theme/types";
import type { Theme } from "@/modules/theme/types";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Lazy-load WebGL backgrounds so `ogl` stays off the critical path.
const AuroraBackground = lazy(() =>
  import("@/components/ui/backgrounds/Aurora").then((m) => ({ default: m.AuroraBackground })),
);
const ParticlesBackground = lazy(() =>
  import("@/components/ui/backgrounds/Particles").then((m) => ({ default: m.ParticlesBackground })),
);
const ThreadsBackground = lazy(() =>
  import("@/components/ui/backgrounds/Threads").then((m) => ({ default: m.ThreadsBackground })),
);

const OVERLAY_Z = 2147483646;
const RESIZE_IDLE_MS = 280;
const FADE_IN_MS = 200;

// ─── Theme color helpers ──────────────────────────────────────────────────────

/** Default accent when the theme provides none (nexis-default palette). */
const FALLBACK_DARK = "#5227FF";
const FALLBACK_LIGHT = "#4318D6";

function getPrimaryHex(
  themeId: string,
  resolvedMode: "dark" | "light",
  customThemes: Theme[],
): string {
  if (themeId === DEFAULT_THEME_ID) {
    return resolvedMode === "dark" ? FALLBACK_DARK : FALLBACK_LIGHT;
  }
  const theme =
    customThemes.find((t) => t.id === themeId) ?? getBuiltinTheme(themeId);
  const variant =
    theme?.variants[resolvedMode] ??
    theme?.variants.dark ??
    theme?.variants.light;
  return (
    variant?.colors?.primary ??
    (resolvedMode === "dark" ? FALLBACK_DARK : FALLBACK_LIGHT)
  );
}

/** Add `amount` (0–1) to each RGB channel, clamping to [0, 255]. */
function lightenHex(hex: string, amount: number): string {
  const h = hex.replace(/^#/, "");
  const n = parseInt(
    h.length === 3 ? h.split("").map((c) => c + c).join("") : h,
    16,
  );
  if (isNaN(n)) return hex;
  const bump = Math.round(amount * 255);
  const clamp = (v: number) => Math.min(255, Math.max(0, v + bump));
  const r = clamp(n >> 16 & 255);
  const g = clamp(n >> 8 & 255);
  const b = clamp(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function hexToRgbTuple(hex: string): [number, number, number] {
  const h = hex.replace(/^#/, "");
  const n = parseInt(
    h.length === 3 ? h.split("").map((c) => c + c).join("") : h,
    16,
  );
  if (isNaN(n)) return [1, 1, 1];
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

// ─── Components ──────────────────────────────────────────────────────────────

export function SurfaceLayer() {
  const [fastPath] = useState(readBgFastPath);
  const hydrated = usePreferencesStore((s) => s.hydrated);
  const backgroundKind = usePreferencesStore((s) => s.backgroundKind);
  const backgroundAnimatedId = usePreferencesStore((s) => s.backgroundAnimatedId);
  const backgroundOpacity = usePreferencesStore((s) => s.backgroundOpacity);
  const storeImageActive = usePreferencesStore(
    (s) => s.backgroundKind === "image" && !!s.backgroundImageId,
  );
  const imageActive = hydrated ? storeImageActive : fastPath.active;

  const { themeId, resolvedMode, customThemes } = useTheme();

  // Animated backgrounds — only render after store hydration
  if (hydrated && backgroundKind === "animated" && backgroundAnimatedId) {
    const primary = getPrimaryHex(themeId, resolvedMode, customThemes);
    return (
      <AnimatedBackground
        // Re-mount on background type OR theme change so colors refresh
        key={`${backgroundAnimatedId}-${themeId}-${resolvedMode}`}
        id={backgroundAnimatedId}
        primaryHex={primary}
        opacity={backgroundOpacity * BG_OPACITY_RENDER_FACTOR}
      />
    );
  }

  if (imageActive) {
    return <BackgroundImage fastImageId={fastPath.imageId} />;
  }

  return null;
}

type AnimBgProps = {
  id: AnimatedBgId;
  primaryHex: string;
  opacity: number;
};

function AnimatedBackground({ id, primaryHex, opacity }: AnimBgProps) {
  // Derive three tonal variants from the primary for richer visuals
  const mid = lightenHex(primaryHex, 0.28);
  const bright = lightenHex(primaryHex, 0.48);

  if (id === "aurora") {
    return (
      <Suspense fallback={null}>
        <AuroraBackground
          colorStops={[primaryHex, mid, primaryHex]}
          opacity={opacity}
        />
      </Suspense>
    );
  }
  if (id === "particles") {
    return (
      <Suspense fallback={null}>
        <ParticlesBackground
          particleColors={[primaryHex, mid, bright]}
          opacity={opacity}
        />
      </Suspense>
    );
  }
  if (id === "threads") {
    return (
      <Suspense fallback={null}>
        <ThreadsBackground
          color={hexToRgbTuple(primaryHex)}
          opacity={opacity}
        />
      </Suspense>
    );
  }
  return null;
}

function BackgroundImage({ fastImageId }: { fastImageId: string | null }) {
  const storeImageId = usePreferencesStore((s) => s.backgroundImageId);
  const hydrated = usePreferencesStore((s) => s.hydrated);
  const imageId = hydrated ? storeImageId : fastImageId;
  const opacity = usePreferencesStore((s) => s.backgroundOpacity);
  const blur = usePreferencesStore((s) => s.backgroundBlur);
  const [state, setState] = useState<{ url: string; animated: boolean } | null>(
    null,
  );
  const [visible, setVisible] = useState(false);
  const lastUrlRef = useRef<string | null>(null);
  const resizing = useWindowResizing(RESIZE_IDLE_MS);
  const docHidden = useDocumentHidden();

  useEffect(() => {
    if (!imageId) return;
    let alive = true;
    let rafId: number | null = null;
    setVisible(false);
    void (async () => {
      const { getBgImage } = await import("./bgImageStore");
      const blob = await getBgImage(imageId).catch(() => null);
      if (!alive || !blob) return;
      const url = URL.createObjectURL(blob);
      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
      lastUrlRef.current = url;
      const t = blob.type.toLowerCase();
      const animated =
        t === "image/gif" || t === "image/apng" || t === "image/webp";
      setState({ url, animated });
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (alive) setVisible(true);
      });
    })();
    return () => {
      alive = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [imageId]);

  useEffect(() => {
    return () => {
      if (lastUrlRef.current) {
        URL.revokeObjectURL(lastUrlRef.current);
        lastUrlRef.current = null;
      }
    };
  }, []);

  if (!state || typeof document === "undefined") return null;
  const { url, animated } = state;

  const suspendAnimated = animated && (resizing || docHidden);
  const blurActive = !animated && blur > 0 && !resizing;
  const renderedOpacity =
    visible && !suspendAnimated ? opacity * BG_OPACITY_RENDER_FACTOR : 0;

  return createPortal(
    <div
      aria-hidden
      className="nexis-bg-surface"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: OVERLAY_Z,
        pointerEvents: "none",
        backgroundImage: suspendAnimated ? "none" : `url(${url})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        opacity: renderedOpacity,
        filter: blurActive ? `blur(${blur}px)` : undefined,
        transform: "translateZ(0)",
        transition: `opacity ${FADE_IN_MS}ms ease-out`,
      }}
    />,
    document.body,
  );
}

function useWindowResizing(idleMs: number): boolean {
  const [resizing, setResizing] = useState(false);
  useEffect(() => {
    let timer: number | null = null;
    let active = false;
    const onResize = () => {
      if (!active) {
        active = true;
        setResizing(true);
      }
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        active = false;
        setResizing(false);
        timer = null;
      }, idleMs);
    };
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [idleMs]);
  return resizing;
}

function useDocumentHidden(): boolean {
  const [hidden, setHidden] = useState(
    () => typeof document !== "undefined" && document.hidden,
  );
  useEffect(() => {
    const onChange = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return hidden;
}
