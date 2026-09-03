// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The document model the canvas edits, and the bridge back to source text.
 *
 * ## Why a real parse rather than string surgery
 *
 * The canvas has to answer "which element did I just click" and "what does the
 * source say now that it moved". Doing that with regexes over the source text
 * fails on the first nested group. So the source is parsed with `DOMParser`
 * into a detached document, mutated as a tree, and serialized back.
 *
 * Parsing is not executing: a document from `DOMParser` is inert until it is
 * inserted, and this one never is — the *preview* renders a separately
 * sanitized string (`svgSanitize.ts`), which stays the only thing that reaches
 * the live DOM.
 *
 * ## Why the user's formatting survives
 *
 * `DOMParser` keeps whitespace text nodes, and every mutation here writes
 * attributes rather than restructuring the tree, so `XMLSerializer` gives back
 * the same indentation and line breaks it was handed. That matters more than
 * it sounds: an editor that reflows the whole document the first time you nudge
 * a rectangle is an editor people stop using.
 *
 * ## The index attribute
 *
 * Elements are tagged `data-nx-id` in document order so a click on the
 * rendered (sanitized) copy can be traced back to a node in the parsed tree.
 * It is stripped on the way out — it never reaches the user's source, and
 * `serializeSvg` is the only exit.
 */

import {
  mapPathString,
  movePathPoint,
  parsePath,
  pathPoints,
  scalePath,
  serializePath,
  translatePath,
} from "./pathData";

export const INDEX_ATTR = "data-nx-id";

/** Tags a click can select. Containers are selectable so a group moves whole. */
const SELECTABLE = new Set([
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "path",
  "text",
  "image",
  "use",
  "g",
]);

export type ParsedSvg = {
  doc: XMLDocument;
  root: SVGSVGElement;
  /** viewBox as [minX, minY, width, height]; synthesized when absent. */
  viewBox: [number, number, number, number];
};

/** Round for markup: short strings, and no `0.30000000000000004`. */
function n(value: number, dp = 3): number {
  return Number(value.toFixed(dp));
}

function num(el: Element, name: string, fallback = 0): number {
  const raw = el.getAttribute(name);
  if (raw === null) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function setNum(el: Element, name: string, value: number): void {
  el.setAttribute(name, String(n(value)));
}

/**
 * Parse a source string into a tagged document.
 *
 * Returns null for anything that is not a well-formed single `<svg>` root —
 * a half-typed document in a live editor is the normal case, and the canvas
 * shows its "keep typing" state rather than an error.
 */
export function parseSvgSource(source: string): ParsedSvg | null {
  if (typeof DOMParser === "undefined") return null;
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(source, "image/svg+xml");
  } catch {
    return null;
  }
  if (doc.getElementsByTagName("parsererror").length > 0) return null;
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== "svg") return null;

  let index = 0;
  const walk = (el: Element) => {
    el.setAttribute(INDEX_ATTR, String(index++));
    for (const child of Array.from(el.children)) walk(child);
  };
  walk(root);

  return {
    doc: doc as XMLDocument,
    root: root as unknown as SVGSVGElement,
    viewBox: readViewBox(root),
  };
}

/**
 * The coordinate system the overlay has to match.
 *
 * With no `viewBox`, an SVG's user units are its `width`/`height` — and with
 * neither, the spec's default replaced-element size (300x150) is what the
 * browser actually lays out, so that is what the overlay must use too.
 */
export function readViewBox(root: Element): [number, number, number, number] {
  const raw = root.getAttribute("viewBox");
  if (raw) {
    const parts = raw
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (parts.length === 4 && parts.every((v) => Number.isFinite(v))) {
      return [parts[0], parts[1], parts[2], parts[3]];
    }
  }
  const w = Number.parseFloat(root.getAttribute("width") ?? "") || 300;
  const h = Number.parseFloat(root.getAttribute("height") ?? "") || 150;
  return [0, 0, w, h];
}

/** Serialize back to source, with the index attribute stripped. */
export function serializeSvg(parsed: ParsedSvg): string {
  const clone = parsed.doc.cloneNode(true) as XMLDocument;
  const strip = (el: Element) => {
    el.removeAttribute(INDEX_ATTR);
    for (const child of Array.from(el.children)) strip(child);
  };
  if (clone.documentElement) strip(clone.documentElement);
  return new XMLSerializer().serializeToString(clone);
}

/** Markup for the preview: the same tree, index attributes intact. */
export function serializeForPreview(parsed: ParsedSvg): string {
  return new XMLSerializer().serializeToString(parsed.doc);
}

export function elementById(parsed: ParsedSvg, id: number): Element | null {
  return parsed.root.querySelector(`[${INDEX_ATTR}="${id}"]`);
}

export function isSelectable(el: Element): boolean {
  return SELECTABLE.has(el.nodeName.toLowerCase());
}

export function indexOf(el: Element): number | null {
  const raw = el.getAttribute(INDEX_ATTR);
  if (raw === null) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The nearest selectable ancestor-or-self.
 *
 * A click lands on whatever primitive is under the cursor, which inside a
 * `<g>` is usually not what the user means to grab — but grabbing the group
 * for every click would make the primitives unreachable. So this returns the
 * primitive, and the canvas offers "select parent" as a separate gesture.
 */
export function selectableFrom(el: Element | null): Element | null {
  let cur: Element | null = el;
  while (cur) {
    if (isSelectable(cur)) return cur;
    cur = cur.parentElement;
  }
  return null;
}

// ── Moving ──────────────────────────────────────────────────────────────────

/**
 * Shift an element by a delta expressed in **its parent's** coordinates.
 *
 * Primitives move by rewriting their own geometry, so the source stays
 * something a person would have written. Only the cases with no geometry of
 * their own — groups, text runs, uses — fall back to a transform, and those
 * merge into any existing one rather than stacking a new attribute each drag.
 */
export function translateElement(el: Element, dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;
  const tag = el.nodeName.toLowerCase();

  switch (tag) {
    case "rect":
    case "image":
    case "svg":
      setNum(el, "x", num(el, "x") + dx);
      setNum(el, "y", num(el, "y") + dy);
      return;
    case "circle":
    case "ellipse":
      setNum(el, "cx", num(el, "cx") + dx);
      setNum(el, "cy", num(el, "cy") + dy);
      return;
    case "line":
      setNum(el, "x1", num(el, "x1") + dx);
      setNum(el, "y1", num(el, "y1") + dy);
      setNum(el, "x2", num(el, "x2") + dx);
      setNum(el, "y2", num(el, "y2") + dy);
      return;
    case "polyline":
    case "polygon": {
      const pts = readPoints(el).map(([x, y]): [number, number] => [
        x + dx,
        y + dy,
      ]);
      writePoints(el, pts);
      return;
    }
    case "path": {
      const d = el.getAttribute("d");
      if (d) el.setAttribute("d", mapPathString(d, (s) => translatePath(s, dx, dy)));
      return;
    }
    case "text":
      setNum(el, "x", num(el, "x") + dx);
      setNum(el, "y", num(el, "y") + dy);
      return;
    default:
      prependTranslate(el, dx, dy);
  }
}

/**
 * Merge a translate into an element's transform list.
 *
 * The merge matters: without it a drag appends a transform on every pointer
 * move, and a second of dragging leaves a kilometre-long attribute that is
 * correct and unreadable.
 */
export function prependTranslate(el: Element, dx: number, dy: number): void {
  const existing = (el.getAttribute("transform") ?? "").trim();
  const lead = /^translate\(\s*([-\d.eE+]+)\s*(?:[, ]\s*([-\d.eE+]+)\s*)?\)/.exec(
    existing,
  );
  if (lead) {
    const x = Number.parseFloat(lead[1]) || 0;
    const y = lead[2] === undefined ? 0 : Number.parseFloat(lead[2]) || 0;
    const rest = existing.slice(lead[0].length).trim();
    const merged = `translate(${n(x + dx)} ${n(y + dy)})`;
    el.setAttribute("transform", rest ? `${merged} ${rest}` : merged);
    return;
  }
  const t = `translate(${n(dx)} ${n(dy)})`;
  el.setAttribute("transform", existing ? `${t} ${existing}` : t);
}

// ── Points lists ────────────────────────────────────────────────────────────

export function readPoints(el: Element): [number, number][] {
  const raw = (el.getAttribute("points") ?? "").trim();
  if (!raw) return [];
  const nums = raw
    .split(/[\s,]+/)
    .map(Number)
    .filter((v) => Number.isFinite(v));
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  return out;
}

export function writePoints(el: Element, pts: readonly [number, number][]): void {
  el.setAttribute("points", pts.map(([x, y]) => `${n(x)},${n(y)}`).join(" "));
}

// ── Handles ─────────────────────────────────────────────────────────────────

/**
 * A draggable dot on the selected element, in that element's own user space.
 *
 * `anchor` sits on the shape, `control` pulls a curve, `size` changes an extent
 * rather than a position. The canvas draws the three differently so a bezier
 * handle is not mistaken for a corner.
 */
export type Handle = {
  id: string;
  x: number;
  y: number;
  kind: "anchor" | "control" | "size";
  /** Draw a tether back to this point; makes bezier controls readable. */
  tether?: { x: number; y: number };
  title?: string;
};

export function handlesFor(el: Element): Handle[] {
  const tag = el.nodeName.toLowerCase();
  switch (tag) {
    case "rect": {
      const x = num(el, "x");
      const y = num(el, "y");
      const w = num(el, "width");
      const h = num(el, "height");
      return [
        { id: "rect:nw", x, y, kind: "size", title: "Top-left" },
        { id: "rect:ne", x: x + w, y, kind: "size", title: "Top-right" },
        { id: "rect:sw", x, y: y + h, kind: "size", title: "Bottom-left" },
        { id: "rect:se", x: x + w, y: y + h, kind: "size", title: "Bottom-right" },
        {
          id: "rect:rx",
          x: x + Math.min(num(el, "rx"), w),
          y,
          kind: "control",
          tether: { x, y },
          title: "Corner radius",
        },
      ];
    }
    case "circle": {
      const cx = num(el, "cx");
      const cy = num(el, "cy");
      return [
        { id: "circle:r", x: cx + num(el, "r"), y: cy, kind: "size", tether: { x: cx, y: cy }, title: "Radius" },
      ];
    }
    case "ellipse": {
      const cx = num(el, "cx");
      const cy = num(el, "cy");
      return [
        { id: "ellipse:rx", x: cx + num(el, "rx"), y: cy, kind: "size", tether: { x: cx, y: cy }, title: "Horizontal radius" },
        { id: "ellipse:ry", x: cx, y: cy + num(el, "ry"), kind: "size", tether: { x: cx, y: cy }, title: "Vertical radius" },
      ];
    }
    case "line":
      return [
        { id: "line:1", x: num(el, "x1"), y: num(el, "y1"), kind: "anchor", title: "Start" },
        { id: "line:2", x: num(el, "x2"), y: num(el, "y2"), kind: "anchor", title: "End" },
      ];
    case "polyline":
    case "polygon":
      return readPoints(el).map(([x, y], i) => ({
        id: `pt:${i}`,
        x,
        y,
        kind: "anchor" as const,
        title: `Point ${i + 1}`,
      }));
    case "path": {
      const d = el.getAttribute("d");
      if (!d) return [];
      const segs = parsePath(d);
      return pathPoints(segs).map((p) => {
        const handle: Handle = {
          id: `p:${p.seg}:${p.slot}`,
          x: p.x,
          y: p.y,
          kind: p.kind,
        };
        if (p.kind === "control") {
          const seg = segs[p.seg];
          const prev = segs[p.seg - 1];
          const anchor =
            p.slot === "c1" && seg?.cmd === "C"
              ? prev && prev.cmd !== "Z"
                ? { x: prev.x, y: prev.y }
                : null
              : seg && seg.cmd !== "Z"
                ? { x: seg.x, y: seg.y }
                : null;
          if (anchor) handle.tether = anchor;
        }
        return handle;
      });
    }
    default:
      return [];
  }
}

/**
 * Apply a handle drag. `x`/`y` are in the element's own user space.
 *
 * Rect corners are the one case with real bookkeeping: dragging the top-left
 * past the bottom-right has to flip the rectangle rather than emit a negative
 * width, which SVG treats as an error and simply does not render.
 */
export function moveHandle(el: Element, id: string, x: number, y: number): void {
  const tag = el.nodeName.toLowerCase();

  if (tag === "rect" && id.startsWith("rect:")) {
    const which = id.slice(5);
    if (which === "rx") {
      const w = num(el, "width");
      setNum(el, "rx", Math.max(0, Math.min(x - num(el, "x"), w / 2)));
      return;
    }
    const x0 = num(el, "x");
    const y0 = num(el, "y");
    const x1 = x0 + num(el, "width");
    const y1 = y0 + num(el, "height");
    const left = which === "nw" || which === "sw" ? x : x0;
    const right = which === "ne" || which === "se" ? x : x1;
    const top = which === "nw" || which === "ne" ? y : y0;
    const bottom = which === "sw" || which === "se" ? y : y1;
    setNum(el, "x", Math.min(left, right));
    setNum(el, "y", Math.min(top, bottom));
    setNum(el, "width", Math.abs(right - left));
    setNum(el, "height", Math.abs(bottom - top));
    return;
  }

  if (tag === "circle" && id === "circle:r") {
    const dx = x - num(el, "cx");
    const dy = y - num(el, "cy");
    setNum(el, "r", Math.max(0, Math.hypot(dx, dy)));
    return;
  }

  if (tag === "ellipse") {
    if (id === "ellipse:rx") setNum(el, "rx", Math.abs(x - num(el, "cx")));
    if (id === "ellipse:ry") setNum(el, "ry", Math.abs(y - num(el, "cy")));
    return;
  }

  if (tag === "line") {
    if (id === "line:1") {
      setNum(el, "x1", x);
      setNum(el, "y1", y);
    } else if (id === "line:2") {
      setNum(el, "x2", x);
      setNum(el, "y2", y);
    }
    return;
  }

  if ((tag === "polyline" || tag === "polygon") && id.startsWith("pt:")) {
    const i = Number.parseInt(id.slice(3), 10);
    const pts = readPoints(el);
    if (i >= 0 && i < pts.length) {
      pts[i] = [x, y];
      writePoints(el, pts);
    }
    return;
  }

  if (tag === "path" && id.startsWith("p:")) {
    const [, segRaw, slot] = id.split(":");
    const seg = Number.parseInt(segRaw, 10);
    const d = el.getAttribute("d");
    if (!d || !Number.isFinite(seg)) return;
    if (slot !== "p" && slot !== "c1" && slot !== "c2") return;
    el.setAttribute(
      "d",
      serializePath(movePathPoint(parsePath(d), { seg, slot }, x, y)),
    );
  }
}

// ── Scaling ─────────────────────────────────────────────────────────────────

/**
 * Scale an element about a pivot, in its own user space.
 *
 * Used by the bounding-box corner drag, which is the gesture that works on
 * every element type — including the ones with no geometry handles of their
 * own, where it falls back to a transform.
 */
export function scaleElement(
  el: Element,
  sx: number,
  sy: number,
  ox: number,
  oy: number,
): void {
  const tag = el.nodeName.toLowerCase();
  const px = (v: number) => ox + (v - ox) * sx;
  const py = (v: number) => oy + (v - oy) * sy;

  switch (tag) {
    case "rect":
    case "image": {
      const x = px(num(el, "x"));
      const y = py(num(el, "y"));
      const w = num(el, "width") * sx;
      const h = num(el, "height") * sy;
      setNum(el, "x", Math.min(x, x + w));
      setNum(el, "y", Math.min(y, y + h));
      setNum(el, "width", Math.abs(w));
      setNum(el, "height", Math.abs(h));
      if (el.hasAttribute("rx")) setNum(el, "rx", Math.abs(num(el, "rx") * sx));
      return;
    }
    case "circle": {
      setNum(el, "cx", px(num(el, "cx")));
      setNum(el, "cy", py(num(el, "cy")));
      // A circle has one radius, so a non-uniform drag has to pick: the
      // average keeps it a circle rather than silently promoting it to an
      // ellipse the source never asked for.
      setNum(el, "r", Math.abs(num(el, "r") * ((sx + sy) / 2)));
      return;
    }
    case "ellipse":
      setNum(el, "cx", px(num(el, "cx")));
      setNum(el, "cy", py(num(el, "cy")));
      setNum(el, "rx", Math.abs(num(el, "rx") * sx));
      setNum(el, "ry", Math.abs(num(el, "ry") * sy));
      return;
    case "line":
      setNum(el, "x1", px(num(el, "x1")));
      setNum(el, "y1", py(num(el, "y1")));
      setNum(el, "x2", px(num(el, "x2")));
      setNum(el, "y2", py(num(el, "y2")));
      return;
    case "polyline":
    case "polygon":
      writePoints(
        el,
        readPoints(el).map(([x, y]): [number, number] => [px(x), py(y)]),
      );
      return;
    case "path": {
      const d = el.getAttribute("d");
      if (d) {
        el.setAttribute("d", mapPathString(d, (s) => scalePath(s, sx, sy, ox, oy)));
      }
      return;
    }
    default: {
      const existing = (el.getAttribute("transform") ?? "").trim();
      const t = `translate(${n(ox)} ${n(oy)}) scale(${n(sx)} ${n(sy)}) translate(${n(-ox)} ${n(-oy)})`;
      el.setAttribute("transform", existing ? `${t} ${existing}` : t);
    }
  }
}

/** Remove an element from the tree. Returns false if it had no parent. */
export function removeElement(el: Element): boolean {
  const parent = el.parentElement;
  if (!parent) return false;
  parent.removeChild(el);
  return true;
}
