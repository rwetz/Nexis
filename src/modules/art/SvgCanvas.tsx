// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Direct manipulation over the same source the editor holds.
 *
 * Sliders and a code pane are two ways of typing numbers. This is the third
 * thing an SVG tool has to have: grab the shape and move it. Everything here
 * ends in a rewritten `d`, `x` or `points` attribute, so the code pane stays
 * the source of truth and there is no second document to keep in sync.
 *
 * ## The security seam, and why the indirection is not optional
 *
 * The preview renders a **sanitized** copy (pitfall-adjacent, see
 * `lib/svgSanitize.ts`: this is a Tauri webview with `window.__TAURI__` in
 * scope, and SVG can carry script). So a click lands on a node in the
 * sanitized render, not in the user's document. `lib/svgDoc.ts` tags every
 * element with `data-nx-id` before sanitizing, and that id is what maps the
 * hit back to the node to mutate. Do not "simplify" this by rendering the raw
 * source, and do not mutate the rendered DOM — it is a copy, and edits to it
 * are discarded on the next render.
 *
 * ## Coordinates
 *
 * Three spaces are in play and mixing them silently produces a drag that
 * drifts: client pixels, the element's own user space (where `x`/`cx`/`d`
 * live), and its parent's space (where a `transform` translate lives). Both
 * conversions go through `getScreenCTM()` on the *rendered* node, which is the
 * only thing that knows about ancestor transforms and the viewBox fit.
 *
 * ## The working document
 *
 * A drag parses once on pointerdown and mutates that tree for the whole
 * gesture. Re-parsing the source on every pointermove would be both slower and
 * wrong: React has not necessarily committed the previous change yet, so the
 * string in props can be one frame stale, and deltas would be applied twice.
 */

import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  elementById,
  handlesFor,
  indexOf,
  isSelectable,
  moveHandle,
  parseSvgSource,
  removeElement,
  scaleElement,
  selectableFrom,
  serializeForPreview,
  serializeSvg,
  translateElement,
  type Handle,
  type ParsedSvg,
} from "./lib/svgDoc";
import { sanitizeSvgForPreview } from "./lib/svgSanitize";

type Props = {
  source: string;
  onChange: (next: string) => void;
};

/**
 * A handle as the overlay draws it: **root user units**, not pixels.
 *
 * The previous arrangement computed container-relative client pixels and drew
 * them into the overlay's own coordinate space, which are only the same thing
 * when nothing between the two applies a scale. This app applies one — CSS
 * `zoom` on `.zoom-content` — so the box and every handle drifted and
 * mis-scaled by the zoom factor. Working in the art's own units means the
 * browser does the mapping and there is nothing left to get wrong.
 */
type OverlayHandle = Handle & {
  ux: number;
  uy: number;
  tetherU?: { x: number; y: number };
};

type Overlay = {
  box: { x: number; y: number; w: number; h: number } | null;
  handles: OverlayHandle[];
  /** Corner grips for the uniform bounding-box scale. */
  corners: { id: string; x: number; y: number }[];
  /**
   * User units per local CSS pixel, so a handle can be a constant on-screen
   * size in a viewBox of any scale. Derived from the overlay's own
   * `clientWidth` and viewBox — both local values, so this stays correct under
   * an ancestor zoom rather than inheriting its error.
   */
  unitsPerPx: number;
};

const EMPTY_OVERLAY: Overlay = {
  box: null,
  handles: [],
  corners: [],
  unitsPerPx: 1,
};

type Drag =
  | { kind: "move"; doc: ParsedSvg; id: number; lastClient: [number, number] }
  | { kind: "handle"; doc: ParsedSvg; id: number; handle: string }
  | {
      kind: "scale";
      id: number;
      corner: string;
      /**
       * A scale factor is absolute, not incremental, so this gesture re-derives
       * from the source as it stood at pointerdown on every move. Compounding
       * instead would mean twenty frames of 1.1x is not 2x, and dragging back
       * would never return the shape to where it started.
       */
      startSource: string;
      /** Bounding box in the element's own user space, at gesture start. */
      box: { x: number; y: number; w: number; h: number };
      /**
       * The element's screen CTM, frozen. Writing a transform (the fallback for
       * a group) changes the live matrix mid-gesture, and reading it back would
       * feed the scale into its own input.
       */
      matrix: DOMMatrix;
    };

/** Map a client point through a screen CTM into that matrix's user space. */
function clientToUser(
  ctm: DOMMatrix,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

/** Map a client point into the user space of a rendered node. */
function toUserSpace(
  node: SVGGraphicsElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const ctm = node.getScreenCTM();
  return ctm ? clientToUser(ctm, clientX, clientY) : null;
}

export function SvgCanvas({ source, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const artRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<Drag | null>(null);

  const [selected, setSelected] = useState<number | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(EMPTY_OVERLAY);
  const [showHandles, setShowHandles] = useState(true);

  // Memoized together: a drag commits on every pointer move, so an unmemoized
  // parse would re-run the whole DOMParser/sanitize pass per frame — and the
  // stale-selection effect below would re-run on every render, since `parsed`
  // would be a fresh object each time.
  const parsed = useMemo(() => parseSvgSource(source), [source]);
  const preview = useMemo(
    () =>
      parsed
        ? sanitizeSvgForPreview(serializeForPreview(parsed))
        : { svg: "", removed: [] as string[] },
    [parsed],
  );

  // The overlay mirrors the art's viewBox and aspect-ratio handling, which is
  // what makes the two coordinate systems literally the same one.
  const viewBox = parsed?.viewBox ?? [0, 0, 24, 24];
  const aspect =
    parsed?.root.getAttribute("preserveAspectRatio") ?? "xMidYMid meet";

  const selectedTag =
    parsed && selected !== null
      ? (elementById(parsed, selected)?.nodeName.toLowerCase() ?? null)
      : null;

  /** The rendered (sanitized) counterpart of a source node. */
  const renderedNode = useCallback((id: number): SVGGraphicsElement | null => {
    const found = artRef.current?.querySelector(`[data-nx-id="${id}"]`);
    return found instanceof SVGGraphicsElement ? found : null;
  }, []);

  // ── Measuring ─────────────────────────────────────────────────────────────
  // Runs after every commit: the rendered tree is replaced wholesale whenever
  // the source changes, so cached nodes and boxes are never reusable.
  //
  // Everything is expressed in the **root svg's** user units. The conversion is
  // a matrix *ratio* — root-inverse times node — so any factor the two share
  // (an ancestor CSS zoom, the device pixel ratio, the viewBox fit) cancels
  // out instead of having to be measured and divided away.
  const measure = useCallback(() => {
    const overlaySvg = overlayRef.current;
    const root = artRef.current?.querySelector("svg");
    if (!overlaySvg || !(root instanceof SVGSVGElement) || selected === null) {
      setOverlay(EMPTY_OVERLAY);
      return;
    }
    const node = renderedNode(selected);
    const rootCtm = root.getScreenCTM();
    const nodeCtm = node?.getScreenCTM();
    if (!node || !rootCtm || !nodeCtm) {
      setOverlay(EMPTY_OVERLAY);
      return;
    }
    const toRoot = rootCtm.inverse().multiply(nodeCtm);
    const at = (x: number, y: number) => {
      const p = new DOMPoint(x, y).matrixTransform(toRoot);
      return { x: p.x, y: p.y };
    };

    let bbox: { x: number; y: number; width: number; height: number } | null =
      null;
    try {
      bbox = node.getBBox();
    } catch {
      // getBBox throws for a node with no rendered geometry (an empty <g>).
      bbox = null;
    }

    const handles: OverlayHandle[] = handlesFor(node).map((h) => {
      const p = at(h.x, h.y);
      const out: OverlayHandle = { ...h, ux: p.x, uy: p.y };
      if (h.tether) out.tetherU = at(h.tether.x, h.tether.y);
      return out;
    });

    // The bbox is mapped corner by corner and re-bounded rather than scaled as
    // a rectangle, so a rotated element still gets a box that contains it.
    const cornerPoints = bbox
      ? ([
          ["nw", bbox.x, bbox.y],
          ["ne", bbox.x + bbox.width, bbox.y],
          ["sw", bbox.x, bbox.y + bbox.height],
          ["se", bbox.x + bbox.width, bbox.y + bbox.height],
        ] as const).map(([id, x, y]) => ({ id, ...at(x, y) }))
      : [];

    const xs = cornerPoints.map((c) => c.x);
    const ys = cornerPoints.map((c) => c.y);
    const box = cornerPoints.length
      ? {
          x: Math.min(...xs),
          y: Math.min(...ys),
          w: Math.max(...xs) - Math.min(...xs),
          h: Math.max(...ys) - Math.min(...ys),
        }
      : null;

    // `xMidYMid meet` (the default, and what the overlay mirrors) fits by the
    // smaller ratio, so that is the scale a handle has to divide by to come out
    // a constant number of pixels across.
    const [, , vbW, vbH] = viewBox;
    const scale = Math.min(
      overlaySvg.clientWidth / vbW,
      overlaySvg.clientHeight / vbH,
    );

    setOverlay({
      box,
      handles,
      corners: cornerPoints,
      unitsPerPx: Number.isFinite(scale) && scale > 0 ? 1 / scale : 1,
    });
  }, [renderedNode, selected, viewBox]);

  useLayoutEffect(() => {
    measure();
  }, [measure, source]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(container);
    return () => ro.disconnect();
  }, [measure]);

  // ── Committing ────────────────────────────────────────────────────────────

  const commit = useCallback(
    (doc: ParsedSvg) => {
      onChange(serializeSvg(doc));
    },
    [onChange],
  );

  /** Mutate the current source once, outside a drag. */
  const edit = useCallback(
    (fn: (doc: ParsedSvg, el: Element) => void) => {
      if (selected === null) return;
      const doc = parseSvgSource(source);
      if (!doc) return;
      const el = elementById(doc, selected);
      if (!el) return;
      fn(doc, el);
      commit(doc);
    },
    [commit, selected, source],
  );

  // ── Pointer ───────────────────────────────────────────────────────────────

  const beginDrag = useCallback(
    (drag: Drag, e: React.PointerEvent) => {
      dragRef.current = drag;
      // Capture on the container, never on the art: the art node under the
      // pointer is destroyed and rebuilt on the first committed change, and a
      // capture held by a removed element ends the gesture mid-drag.
      containerRef.current?.setPointerCapture(e.pointerId);
    },
    [],
  );

  const onArtPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target instanceof Element ? e.target : null;
      const hit = selectableFrom(target);
      if (!hit || !isSelectable(hit)) {
        setSelected(null);
        return;
      }
      const id = indexOf(hit);
      if (id === null) return;
      setSelected(id);

      const doc = parseSvgSource(source);
      if (!doc) return;
      e.preventDefault();
      beginDrag(
        { kind: "move", doc, id, lastClient: [e.clientX, e.clientY] },
        e,
      );
    },
    [beginDrag, source],
  );

  const onHandlePointerDown = useCallback(
    (e: React.PointerEvent, handleId: string) => {
      if (e.button !== 0 || selected === null) return;
      e.preventDefault();
      e.stopPropagation();
      const doc = parseSvgSource(source);
      if (!doc) return;
      beginDrag({ kind: "handle", doc, id: selected, handle: handleId }, e);
    },
    [beginDrag, selected, source],
  );

  const onCornerPointerDown = useCallback(
    (e: React.PointerEvent, corner: string) => {
      if (e.button !== 0 || selected === null) return;
      e.preventDefault();
      e.stopPropagation();
      const node = renderedNode(selected);
      const matrix = node?.getScreenCTM();
      if (!node || !matrix) return;
      let bbox: DOMRect;
      try {
        bbox = node.getBBox();
      } catch {
        return;
      }
      if (bbox.width === 0 || bbox.height === 0) return;
      beginDrag(
        {
          kind: "scale",
          id: selected,
          corner,
          startSource: source,
          box: { x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height },
          matrix,
        },
        e,
      );
    },
    [beginDrag, renderedNode, selected, source],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      if (drag.kind === "scale") {
        const doc = parseSvgSource(drag.startSource);
        const el = doc && elementById(doc, drag.id);
        if (!doc || !el) return;
        const p = clientToUser(drag.matrix, e.clientX, e.clientY);
        const { box, corner } = drag;
        // The dragged corner chases the pointer while the opposite one stays
        // put — the only behaviour that reads as a handle rather than a nudge.
        const anchorX = corner === "nw" || corner === "sw" ? box.x + box.w : box.x;
        const anchorY = corner === "nw" || corner === "ne" ? box.y + box.h : box.y;
        const spanX =
          corner === "nw" || corner === "sw" ? box.x - anchorX : box.x + box.w - anchorX;
        const spanY =
          corner === "nw" || corner === "ne" ? box.y - anchorY : box.y + box.h - anchorY;
        if (spanX === 0 || spanY === 0) return;
        const rawX = (p.x - anchorX) / spanX;
        const rawY = (p.y - anchorY) / spanY;
        // Uniform by default: a squashed icon is almost never what a corner
        // drag meant. Shift is the escape hatch to a free scale.
        let sx = rawX;
        let sy = rawY;
        if (!e.shiftKey) {
          const magnitude = Math.max(Math.abs(rawX), Math.abs(rawY));
          if (magnitude === 0) return;
          sx = Math.sign(rawX || 1) * magnitude;
          sy = Math.sign(rawY || 1) * magnitude;
        }
        scaleElement(el, sx, sy, anchorX, anchorY);
        commit(doc);
        return;
      }

      const node = renderedNode(drag.id);
      if (!node) return;
      const el = elementById(drag.doc, drag.id);
      if (!el) return;

      if (drag.kind === "move") {
        // The translate lands in the parent's space, so the delta has to be
        // measured there — the element's own space would double-count its
        // transform on every frame.
        const frame =
          node.parentElement instanceof SVGGraphicsElement
            ? node.parentElement
            : node;
        const from = toUserSpace(frame, drag.lastClient[0], drag.lastClient[1]);
        const to = toUserSpace(frame, e.clientX, e.clientY);
        if (!from || !to) return;
        translateElement(el, to.x - from.x, to.y - from.y);
        drag.lastClient = [e.clientX, e.clientY];
        commit(drag.doc);
        return;
      }

      const p = toUserSpace(node, e.clientX, e.clientY);
      if (!p) return;
      moveHandle(el, drag.handle, p.x, p.y);
      commit(drag.doc);
    },
    [commit, renderedNode],
  );

  const endDrag = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (containerRef.current?.hasPointerCapture(e.pointerId)) {
      containerRef.current.releasePointerCapture(e.pointerId);
    }
  }, []);

  // ── Keyboard ──────────────────────────────────────────────────────────────

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (selected === null) return;
      if (e.key === "Escape") {
        setSelected(null);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        edit((_doc, el) => removeElement(el));
        setSelected(null);
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      const nudge: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const delta = nudge[e.key];
      if (delta) {
        e.preventDefault();
        edit((_doc, el) => translateElement(el, delta[0], delta[1]));
      }
    },
    [edit, selected],
  );

  const selectParent = useCallback(() => {
    if (!parsed || selected === null) return;
    const el = elementById(parsed, selected);
    const parent = el?.parentElement;
    if (!parent || !isSelectable(parent)) return;
    const id = indexOf(parent);
    if (id !== null) setSelected(id);
  }, [parsed, selected]);

  // Selecting a node that no longer exists (the source was edited in the code
  // pane) leaves a selection pointing at nothing.
  useEffect(() => {
    if (parsed && selected !== null && !elementById(parsed, selected)) {
      setSelected(null);
    }
  }, [parsed, selected]);

  if (!parsed) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="max-w-64 text-center text-[11px] leading-relaxed text-muted-foreground">
          The canvas needs a complete, well-formed{" "}
          <code className="text-[10.5px]">&lt;svg&gt;</code> document. Keep
          typing in Source — it appears as soon as the markup parses.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Selection bar */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border/50 px-2 py-1.5">
        <Icon name="cursor" size="xs" className="text-muted-foreground" />
        {selectedTag ? (
          <>
            <span className="font-mono text-[10.5px] text-foreground">
              &lt;{selectedTag}&gt;
            </span>
            <button
              type="button"
              onClick={selectParent}
              title="Select the enclosing group"
              className="rounded px-1 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
            >
              Parent
            </button>
            <button
              type="button"
              onClick={() => {
                edit((_doc, el) => removeElement(el));
                setSelected(null);
              }}
              title="Delete this element"
              className="rounded px-1 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
            >
              Delete
            </button>
          </>
        ) : (
          <span className="text-[10.5px] text-muted-foreground/70">
            Click a shape to select it
          </span>
        )}

        <button
          type="button"
          aria-pressed={showHandles}
          onClick={() => setShowHandles((v) => !v)}
          title="Show the point handles"
          className={cn(
            "ml-auto rounded p-0.5 transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
            showHandles
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon name="nodes" size="sm" active={showHandles} />
        </button>
      </div>

      {/* Canvas */}
      {/* zoom-exempt for the same reason the terminal, the REPL and every
          CodeMirror instance are (pitfall #15): under an ancestor CSS `zoom`
          the geometry APIs this canvas is built on stop agreeing with the
          pointer coordinates they are compared against. Net scale 1.0 in here
          means `getScreenCTM`, `clientWidth` and `clientX` are all in one
          space, with no zoom factor left to divide out. */}
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="zoom-exempt relative min-h-0 flex-1 overflow-hidden bg-[var(--nx-canvas-bg)] focus-visible:outline-none"
        style={
          {
            // A checkerboard reads as "transparent" without needing a legend,
            // and keeps a white-on-white icon visible.
            "--nx-canvas-bg": "transparent",
            backgroundImage:
              "linear-gradient(45deg, var(--muted) 25%, transparent 25%)," +
              "linear-gradient(-45deg, var(--muted) 25%, transparent 25%)," +
              "linear-gradient(45deg, transparent 75%, var(--muted) 75%)," +
              "linear-gradient(-45deg, transparent 75%, var(--muted) 75%)",
            backgroundSize: "16px 16px",
            backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
          } as React.CSSProperties
        }
      >
        {/* The art. `pointer-events: all` on the shapes is what makes an
            unfilled icon stroke's interior clickable — without it, only the
            stroke itself is a hit target and most icons are unselectable. */}
        <style>{`
          .nx-canvas-art > svg { width: 100%; height: 100%; }
          .nx-canvas-art path, .nx-canvas-art rect, .nx-canvas-art circle,
          .nx-canvas-art ellipse, .nx-canvas-art line, .nx-canvas-art polyline,
          .nx-canvas-art polygon, .nx-canvas-art text, .nx-canvas-art image,
          .nx-canvas-art use { pointer-events: all; cursor: move; }
        `}</style>
        <div
          ref={artRef}
          className="nx-canvas-art absolute inset-0 p-4 text-foreground"
          onPointerDown={onArtPointerDown}
          // Sanitized copy, never the raw source — see the module note.
          dangerouslySetInnerHTML={{ __html: preview.svg }}
        />

        {/* Overlay. Same box and same viewBox as the art, so its user units
            *are* the art's user units — no pixel conversion anywhere, and
            nothing for an ancestor zoom to skew. Inert except for the grips,
            so clicks reach the art underneath. */}
        <div className="pointer-events-none absolute inset-0 p-4">
          <svg
            ref={overlayRef}
            className="h-full w-full overflow-visible"
            viewBox={viewBox.join(" ")}
            preserveAspectRatio={aspect}
            aria-hidden
          >
            {overlay.box && (
              <>
                <rect
                  x={overlay.box.x}
                  y={overlay.box.y}
                  width={overlay.box.w}
                  height={overlay.box.h}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth={1}
                  strokeDasharray="3 2"
                  vectorEffect="non-scaling-stroke"
                  opacity={0.7}
                />

                {overlay.corners.map((c) => (
                  <rect
                    key={c.id}
                    x={c.x - 3.5 * overlay.unitsPerPx}
                    y={c.y - 3.5 * overlay.unitsPerPx}
                    width={7 * overlay.unitsPerPx}
                    height={7 * overlay.unitsPerPx}
                    fill="var(--background)"
                    stroke="var(--primary)"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                    className="pointer-events-auto cursor-nwse-resize"
                    onPointerDown={(e) => onCornerPointerDown(e, c.id)}
                  />
                ))}

                {showHandles &&
                  overlay.handles.map((h) => (
                    <g key={h.id}>
                      {h.tetherU && (
                        <line
                          x1={h.tetherU.x}
                          y1={h.tetherU.y}
                          x2={h.ux}
                          y2={h.uy}
                          stroke="var(--primary)"
                          strokeWidth={1}
                          vectorEffect="non-scaling-stroke"
                          opacity={0.4}
                        />
                      )}
                      <circle
                        cx={h.ux}
                        cy={h.uy}
                        r={(h.kind === "control" ? 3.5 : 4.5) * overlay.unitsPerPx}
                        fill={
                          h.kind === "anchor"
                            ? "var(--primary)"
                            : "var(--background)"
                        }
                        stroke="var(--primary)"
                        strokeWidth={1.25}
                        vectorEffect="non-scaling-stroke"
                        className="pointer-events-auto cursor-crosshair"
                        onPointerDown={(e) => onHandlePointerDown(e, h.id)}
                      >
                        {h.title && <title>{h.title}</title>}
                      </circle>
                    </g>
                  ))}
              </>
            )}
          </svg>
        </div>
      </div>

      {preview.removed.length > 0 && (
        <div className="shrink-0 border-t border-border/50 bg-amber-500/[0.08] px-3 py-1.5">
          <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-amber-600 dark:text-amber-400">
            <Icon name="security" size="xs" className="mt-px shrink-0" />
            <span>
              The canvas is not rendering {preview.removed.join(", ")} — your
              source is unchanged.
            </span>
          </p>
        </div>
      )}

      <div className="shrink-0 border-t border-border/50 px-3 py-1.5">
        <p className="text-[9.5px] leading-relaxed text-muted-foreground/70">
          Drag to move. Dots are points — filled ones sit on the shape, hollow
          ones pull a curve. Corner squares scale (hold Shift to stretch).
          Arrows nudge, Delete removes.
        </p>
      </div>
    </div>
  );
}
