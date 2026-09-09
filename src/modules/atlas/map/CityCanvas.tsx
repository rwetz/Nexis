// The canvas itself: owns the camera, the pointer, and the draw loop.
//
// React never re-renders on pan or hover — the camera lives in a ref and the
// canvas repaints through a single rAF-scheduled draw. Only things the rest
// of the UI needs (hover, selection) are pushed into the store.

// Imported from the concrete module, not the `@/modules/theme` barrel: the
// barrel and ThemeProvider are mutually dependent, so a lazy chunk reaching
// useTheme through it makes Rollup emit a circular chunk dependency and warn
// about broken execution order. Same reason the ML plugin avoids its barrel.
import { useTheme } from "@/modules/theme/ThemeProvider";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  fitCamera,
  hitTest,
  isoDeltaToWorld,
  prepare,
  renderScene,
  rotatePoint,
  rotateRect,
  type Camera,
  type Prepared,
  type Viewport,
} from "./iso";
import { layoutAtlas, layoutCity, type Block, type Scene } from "./layout";
import { readPalette } from "./palette";
import { useAtlasStore } from "@/modules/atlas/repos/store";

const MIN_SCALE = 0.6;
const MAX_SCALE = 260;
/** Camera moves are a tween. Longer than any of the `--dur-*` motion
 *  tokens on purpose: those size a UI element getting out of the way,
 *  and this is a camera crossing a scene — reusing `--dur-window` here
 *  would make flying into a repo feel like a popover opening. */
const FLY_MS = 340;
/** A new city does more than arrive: its towers assemble from their terraces.
 * It is intentionally scene-scale rather than UI-token scale, and reduced
 * motion users receive the complete city in its first frame. */
const SCENE_REVEAL_MS = 420;

export function CityCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const view = useAtlasStore((s) => s.mapView);
  const repos = useAtlasStore((s) => s.repos);
  const city = useAtlasStore((s) => s.city);
  const showLabels = useAtlasStore((s) => s.showLabels);
  const fitNonce = useAtlasStore((s) => s.fitNonce);
  const enterRepo = useAtlasStore((s) => s.enterRepo);
  const { resolvedMode, themeId, paletteEpoch } = useTheme();

  const scene: Scene = useMemo(
    () => (view === "city" && city ? layoutCity(city.root) : layoutAtlas(repos)),
    [view, city, repos],
  );

  const palette = useMemo(
    () => readPalette(resolvedMode === "dark"),
    // Theme id changes rewrite the same CSS variables, so re-read whenever the
    // provider says anything about the theme changed — and only once the epoch
    // confirms the new variables are on the document, since this reads them
    // back through a computed-style probe.
    [resolvedMode, themeId, paletteEpoch],
  );

  const cam = useRef<Camera>({ tx: 50, tz: 50, scale: 6, rot: 0 });
  const vp = useRef<Viewport>({ w: 1, h: 1 });
  const preparedRef = useRef<Prepared[]>([]);
  const frame = useRef<number | null>(null);
  const sceneReveal = useRef<number | null>(null);
  const fly = useRef<{ from: Camera; to: Camera; start: number } | null>(null);
  const drag = useRef<{ x: number; y: number; tx: number; tz: number } | null>(null);

  // ── drawing ──────────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    frame.current = null;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let reveal = 1;
    if (sceneReveal.current !== null) {
      const elapsed = performance.now() - sceneReveal.current;
      reveal = easeOutQuint(Math.min(1, elapsed / SCENE_REVEAL_MS));
      if (reveal < 1) frame.current = requestAnimationFrame(draw);
      else sceneReveal.current = null;
    }

    const { hover, selectedBlock: selected } = useAtlasStore.getState();
    renderScene(ctx, preparedRef.current, scene, cam.current, vp.current, {
      palette,
      hoverId: hover?.id ?? null,
      selectedId: selected?.id ?? null,
      showLabels,
      reveal,
    });
  }, [scene, palette, showLabels]);

  const schedule = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(draw);
  }, [draw]);

  // ── camera moves ─────────────────────────────────────────────────────────

  const flyTo = useCallback(
    (target: Camera) => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) {
        cam.current = target;
        fly.current = null;
        schedule();
        return;
      }
      fly.current = { from: { ...cam.current }, to: target, start: performance.now() };
      const step = () => {
        const state = fly.current;
        if (!state) return;
        const t = Math.min(1, (performance.now() - state.start) / FLY_MS);
        const e = easeOutQuint(t);
        cam.current = {
          tx: lerp(state.from.tx, state.to.tx, e),
          tz: lerp(state.from.tz, state.to.tz, e),
          scale: Math.exp(lerp(Math.log(state.from.scale), Math.log(state.to.scale), e)),
          rot: state.to.rot,
        };
        draw();
        if (t < 1) requestAnimationFrame(step);
        else fly.current = null;
      };
      requestAnimationFrame(step);
    },
    [draw, schedule],
  );

  const stopFly = useCallback(() => {
    fly.current = null;
  }, []);

  // ── scene / viewport wiring ──────────────────────────────────────────────

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const apply = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      vp.current = { w, h };
      schedule();
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [schedule]);

  useEffect(() => {
    useAtlasStore.getState().setOmitted(scene.omitted);
  }, [scene]);

  // Fit on every new scene and whenever something asks for it.
  useEffect(() => {
    stopFly();
    sceneReveal.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? null
      : performance.now();
    cam.current = fitCamera(scene, vp.current, cam.current.rot);
    preparedRef.current = prepare(scene, cam.current.rot);
    schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitNonce, scene]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  // ── pointer ──────────────────────────────────────────────────────────────

  const localPoint = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    stopFly();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = localPoint(e);
    drag.current = { x: p.x, y: p.y, tx: cam.current.tx, tz: cam.current.tz };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = localPoint(e);
    const d = drag.current;
    if (d) {
      // Invert the projection for the drag delta so the ground tracks the
      // cursor exactly rather than at some fudge factor.
      const { dx, dz } = isoDeltaToWorld(
        (p.x - d.x) / cam.current.scale,
        (p.y - d.y) / cam.current.scale,
      );
      cam.current = { ...cam.current, tx: d.tx - dx, tz: d.tz - dz };
      schedule();
      return;
    }
    const hit = hitTest(preparedRef.current, cam.current, vp.current, p.x, p.y);
    const store = useAtlasStore.getState();
    if (store.hover?.id !== (hit?.id ?? null)) {
      // Swapped on the element rather than through state: hover deliberately
      // never re-renders React, and the class carries the bespoke cursor PNG.
      e.currentTarget.classList.toggle("cursor-pointer", hit !== null);
      e.currentTarget.classList.toggle("cursor-grab", hit === null);
      store.setHover(hit);
      schedule();
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const p = localPoint(e);
    const moved = Math.hypot(p.x - d.x, p.y - d.y);
    if (moved > 4) return; // a pan, not a click
    const hit = hitTest(preparedRef.current, cam.current, vp.current, p.x, p.y);
    useAtlasStore.getState().setSelectedBlock(hit);
    schedule();
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const p = localPoint(e);
    const hit = hitTest(preparedRef.current, cam.current, vp.current, p.x, p.y);
    if (!hit) return;
    if (hit.ref.kind === "repo" || hit.ref.kind === "district") {
      void enterRepo(hit.ref.repo.path);
      return;
    }
    zoomToBlock(hit);
  };

  const zoomToBlock = useCallback(
    (block: Block) => {
      // The camera target lives in the rotated frame, same as the projection.
      const r = rotateRect(block, cam.current.rot, scene.extent / 2);
      const cx = r.x + r.w / 2;
      const cz = r.z + r.d / 2;
      const span = Math.max(r.w, r.d, 1);
      const target = fitCamera(scene, vp.current, cam.current.rot);
      flyTo({
        tx: cx,
        tz: cz,
        rot: cam.current.rot,
        scale: clamp(
          Math.min(vp.current.w, vp.current.h) / (span * 1.9),
          target.scale,
          MAX_SCALE,
        ),
      });
    },
    [flyTo, scene],
  );

  // Wheel needs a non-passive listener to be able to preventDefault.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stopFly();
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const next = clamp(
        cam.current.scale * Math.exp(-e.deltaY * 0.0016),
        MIN_SCALE,
        MAX_SCALE,
      );
      // Keep the world point under the cursor pinned while the scale changes.
      const k = 1 / cam.current.scale - 1 / next;
      const { dx, dz } = isoDeltaToWorld(
        (px - vp.current.w / 2) * k,
        (py - vp.current.h / 2) * k,
      );
      cam.current = {
        ...cam.current,
        scale: next,
        tx: cam.current.tx + dx,
        tz: cam.current.tz + dz,
      };
      schedule();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [schedule, stopFly]);

  // ── keyboard: rotate / fit ───────────────────────────────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable))
        return;

      const turn = (by: number) => {
        stopFly();
        // The camera target lives in the rotated frame, so turning it by the
        // same quarter turn keeps whatever you were looking at under the
        // crosshair — and your zoom survives the turn.
        const [tx, tz] = rotatePoint(
          cam.current.tx,
          cam.current.tz,
          by,
          scene.extent / 2,
        );
        cam.current = {
          tx,
          tz,
          scale: cam.current.scale,
          rot: (cam.current.rot + by + 4) % 4,
        };
        preparedRef.current = prepare(scene, cam.current.rot);
        schedule();
      };

      switch (e.key) {
        case "q":
          e.preventDefault();
          turn(-1);
          break;
        case "e":
          e.preventDefault();
          turn(1);
          break;
        case "f":
          e.preventDefault();
          flyTo(fitCamera(scene, vp.current, cam.current.rot));
          break;
        case "l":
          e.preventDefault();
          useAtlasStore.getState().toggleLabels();
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [scene, schedule, stopFly, flyTo]);

  // Hover/selection are drawn, not React state, so repaint when they move.
  useEffect(() => useAtlasStore.subscribe(schedule), [schedule]);

  return (
    <div ref={wrapRef} className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="block size-full cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onPointerLeave={(e) => {
          e.currentTarget.classList.remove("cursor-pointer");
          e.currentTarget.classList.add("cursor-grab");
          useAtlasStore.getState().setHover(null);
        }}
        onDoubleClick={onDoubleClick}
      />
    </div>
  );
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** The house `--ease-enter` shape as a scalar easing, for a value the
 *  canvas has to interpolate itself — CSS custom properties are not
 *  reachable from a requestAnimationFrame loop. Decelerating, no
 *  overshoot, matching every panel transition in the app. */
function easeOutQuint(t: number): number {
  return 1 - Math.pow(1 - t, 5);
}
