// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * A path `d` attribute, as something you can drag.
 *
 * The canvas needs to answer two questions about a `<path>`: where are its
 * handles, and what is the `d` string once one of them moves. Both are pure
 * string-to-string work, which is why this module is deliberately free of the
 * DOM — it is the half of direct manipulation that can be tested without a
 * browser, and the half that is easy to get subtly wrong.
 *
 * ## Everything is normalized to absolute, and to five commands
 *
 * Relative commands (`m l c …`), the shorthands (`H V S T`) and repeated
 * coordinate pairs after a single command letter all mean something a dragging
 * UI cannot use directly: a handle's position depends on the segments before
 * it, so moving one point would silently move every later point too. Parsing
 * to absolute `M L C Q A Z` collapses that entirely — every point in the
 * output is an independent coordinate.
 *
 * The cost is honest and worth naming: a re-serialized path is longer than a
 * tight relative one, and the optimizer is what wins that back. A path is only
 * rewritten when the user actually drags something, never on load.
 *
 * ## Arc flags are parsed by hand, on purpose
 *
 * `A` takes two unitless flags, and the grammar allows them to run together
 * with the next number: `a1 1 0 011 1` is a valid, common (and Illustrator-
 * emitted) spelling of `a 1 1 0 0 1 1 1`. A generic number scanner reads
 * `011` as one number and produces a corrupt arc — so the arc reader consumes
 * its flags as single characters.
 */

export type Seg =
  | { cmd: "M"; x: number; y: number }
  | { cmd: "L"; x: number; y: number }
  | { cmd: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { cmd: "Q"; x1: number; y1: number; x: number; y: number }
  | {
      cmd: "A";
      rx: number;
      ry: number;
      rot: number;
      large: number;
      sweep: number;
      x: number;
      y: number;
    }
  | { cmd: "Z" };

/** Which coordinate of a segment a handle refers to. */
export type PointSlot = "p" | "c1" | "c2";

export type PathPoint = {
  seg: number;
  slot: PointSlot;
  x: number;
  y: number;
  /** Anchors sit on the curve; controls pull it. Drawn differently. */
  kind: "anchor" | "control";
};

// ── Parsing ─────────────────────────────────────────────────────────────────

/** A cursor over the `d` string. Kept local; there is exactly one consumer. */
class Scanner {
  private i = 0;
  constructor(private readonly s: string) {}

  private skipSeparators(): void {
    while (this.i < this.s.length) {
      const c = this.s[this.i];
      if (c === "," || c === " " || c === "\t" || c === "\n" || c === "\r") {
        this.i++;
      } else {
        break;
      }
    }
  }

  atEnd(): boolean {
    this.skipSeparators();
    return this.i >= this.s.length;
  }

  /** The next command letter, or null if the next token is a number. */
  command(): string | null {
    this.skipSeparators();
    const c = this.s[this.i];
    if (c && /[MmLlHhVvCcSsQqTtAaZz]/.test(c)) {
      this.i++;
      return c;
    }
    return null;
  }

  number(): number | null {
    this.skipSeparators();
    const rest = this.s.slice(this.i);
    const m = /^[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/.exec(rest);
    if (!m) return null;
    this.i += m[0].length;
    const value = Number(m[0]);
    return Number.isFinite(value) ? value : null;
  }

  /**
   * An arc flag: exactly one character, `0` or `1`. Reading it as a number
   * would swallow the digits of whatever follows — see the module note.
   */
  flag(): number | null {
    this.skipSeparators();
    const c = this.s[this.i];
    if (c === "0" || c === "1") {
      this.i++;
      return Number(c);
    }
    return null;
  }
}

/**
 * Parse a `d` attribute into absolute segments.
 *
 * Malformed input stops the parse and returns what was understood up to that
 * point rather than throwing — a half-typed path in a live editor is the
 * normal case, not an error, and the canvas simply shows fewer handles until
 * the string is complete again.
 */
export function parsePath(d: string): Seg[] {
  const sc = new Scanner(d);
  const out: Seg[] = [];
  // Current point, and the start of the current subpath (where `Z` returns to).
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let cmd: string | null = null;
  // The previous curve's control point, for the S/T shorthands' reflection.
  let lastC: [number, number] | null = null;
  let lastQ: [number, number] | null = null;

  while (!sc.atEnd()) {
    const next = sc.command();
    if (next) {
      cmd = next;
    } else if (!cmd) {
      break;
    } else if (cmd === "M") {
      // A repeated coordinate pair after `M` is an implicit `L` (and after
      // `m`, an implicit `l`) — one of the grammar's genuine traps.
      cmd = "L";
    } else if (cmd === "m") {
      cmd = "l";
    }

    const rel = cmd === cmd?.toLowerCase();
    const up = cmd?.toUpperCase();
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;

    if (up === "Z") {
      out.push({ cmd: "Z" });
      cx = sx;
      cy = sy;
      lastC = null;
      lastQ = null;
      continue;
    }

    if (up === "M" || up === "L") {
      const x = sc.number();
      const y = sc.number();
      if (x === null || y === null) break;
      cx = ox + x;
      cy = oy + y;
      if (up === "M") {
        sx = cx;
        sy = cy;
        out.push({ cmd: "M", x: cx, y: cy });
      } else {
        out.push({ cmd: "L", x: cx, y: cy });
      }
      lastC = null;
      lastQ = null;
      continue;
    }

    if (up === "H" || up === "V") {
      const v = sc.number();
      if (v === null) break;
      if (up === "H") cx = ox + v;
      else cy = oy + v;
      out.push({ cmd: "L", x: cx, y: cy });
      lastC = null;
      lastQ = null;
      continue;
    }

    if (up === "C" || up === "S") {
      let x1: number;
      let y1: number;
      if (up === "C") {
        const a = sc.number();
        const b = sc.number();
        if (a === null || b === null) break;
        x1 = ox + a;
        y1 = oy + b;
      } else {
        // S reflects the previous cubic's second control through the current
        // point; with no previous cubic the reflection is the point itself.
        x1 = lastC ? 2 * cx - lastC[0] : cx;
        y1 = lastC ? 2 * cy - lastC[1] : cy;
      }
      const a2 = sc.number();
      const b2 = sc.number();
      const ax = sc.number();
      const ay = sc.number();
      if (a2 === null || b2 === null || ax === null || ay === null) break;
      const x2 = ox + a2;
      const y2 = oy + b2;
      const x = ox + ax;
      const y = oy + ay;
      out.push({ cmd: "C", x1, y1, x2, y2, x, y });
      lastC = [x2, y2];
      lastQ = null;
      cx = x;
      cy = y;
      continue;
    }

    if (up === "Q" || up === "T") {
      let x1: number;
      let y1: number;
      if (up === "Q") {
        const a = sc.number();
        const b = sc.number();
        if (a === null || b === null) break;
        x1 = ox + a;
        y1 = oy + b;
      } else {
        x1 = lastQ ? 2 * cx - lastQ[0] : cx;
        y1 = lastQ ? 2 * cy - lastQ[1] : cy;
      }
      const ax = sc.number();
      const ay = sc.number();
      if (ax === null || ay === null) break;
      const x = ox + ax;
      const y = oy + ay;
      out.push({ cmd: "Q", x1, y1, x, y });
      lastQ = [x1, y1];
      lastC = null;
      cx = x;
      cy = y;
      continue;
    }

    if (up === "A") {
      const rx = sc.number();
      const ry = sc.number();
      const rot = sc.number();
      const large = sc.flag();
      const sweep = sc.flag();
      const ax = sc.number();
      const ay = sc.number();
      if (
        rx === null ||
        ry === null ||
        rot === null ||
        large === null ||
        sweep === null ||
        ax === null ||
        ay === null
      ) {
        break;
      }
      const x = ox + ax;
      const y = oy + ay;
      out.push({ cmd: "A", rx, ry, rot, large, sweep, x, y });
      lastC = null;
      lastQ = null;
      cx = x;
      cy = y;
      continue;
    }

    break;
  }

  return out;
}

// ── Serialization ───────────────────────────────────────────────────────────

/** Round for markup: short strings, and no `0.30000000000000004`. */
function n(value: number, dp = 3): string {
  return String(Number(value.toFixed(dp)));
}

export function serializePath(segs: readonly Seg[]): string {
  return segs
    .map((s) => {
      switch (s.cmd) {
        case "M":
          return `M ${n(s.x)} ${n(s.y)}`;
        case "L":
          return `L ${n(s.x)} ${n(s.y)}`;
        case "C":
          return `C ${n(s.x1)} ${n(s.y1)} ${n(s.x2)} ${n(s.y2)} ${n(s.x)} ${n(s.y)}`;
        case "Q":
          return `Q ${n(s.x1)} ${n(s.y1)} ${n(s.x)} ${n(s.y)}`;
        case "A":
          return `A ${n(s.rx)} ${n(s.ry)} ${n(s.rot)} ${s.large} ${s.sweep} ${n(s.x)} ${n(s.y)}`;
        case "Z":
          return "Z";
      }
    })
    .join(" ");
}

// ── Handles ─────────────────────────────────────────────────────────────────

/**
 * Every draggable point on a path, in document order.
 *
 * Controls are listed before the anchor they belong to so that a handle drawn
 * later paints over one drawn earlier: anchors sit on the curve and are what
 * you reach for most, so they win an overlap.
 */
export function pathPoints(segs: readonly Seg[]): PathPoint[] {
  const out: PathPoint[] = [];
  segs.forEach((s, i) => {
    if (s.cmd === "Z") return;
    if (s.cmd === "C") {
      out.push({ seg: i, slot: "c1", x: s.x1, y: s.y1, kind: "control" });
      out.push({ seg: i, slot: "c2", x: s.x2, y: s.y2, kind: "control" });
    } else if (s.cmd === "Q") {
      out.push({ seg: i, slot: "c1", x: s.x1, y: s.y1, kind: "control" });
    }
    out.push({ seg: i, slot: "p", x: s.x, y: s.y, kind: "anchor" });
  });
  return out;
}

/**
 * The anchor a control handle belongs to, so the canvas can draw the tether
 * that makes a bezier readable. `null` for an anchor, or for a control whose
 * partner is off the start of the path.
 */
export function controlAnchor(
  segs: readonly Seg[],
  point: PathPoint,
): { x: number; y: number } | null {
  if (point.kind !== "control") return null;
  const seg = segs[point.seg];
  if (!seg) return null;
  // A cubic's first control belongs to the *previous* segment's endpoint;
  // its second, and a quadratic's only control, belong to its own.
  if (point.slot === "c1" && seg.cmd === "C") {
    const prev = segs[point.seg - 1];
    if (!prev || prev.cmd === "Z") return null;
    return { x: prev.x, y: prev.y };
  }
  if (seg.cmd === "Z") return null;
  return { x: seg.x, y: seg.y };
}

// ── Mutation ────────────────────────────────────────────────────────────────

/** Move one handle. Returns a new array; the input is not touched. */
export function movePathPoint(
  segs: readonly Seg[],
  point: { seg: number; slot: PointSlot },
  x: number,
  y: number,
): Seg[] {
  return segs.map((s, i) => {
    if (i !== point.seg || s.cmd === "Z") return s;
    if (point.slot === "p") return { ...s, x, y };
    if (point.slot === "c1" && (s.cmd === "C" || s.cmd === "Q")) {
      return { ...s, x1: x, y1: y };
    }
    if (point.slot === "c2" && s.cmd === "C") return { ...s, x2: x, y2: y };
    return s;
  });
}

/** Shift every coordinate. Used when the whole path is dragged. */
export function translatePath(
  segs: readonly Seg[],
  dx: number,
  dy: number,
): Seg[] {
  return segs.map((s) => {
    switch (s.cmd) {
      case "Z":
        return s;
      case "C":
        return {
          ...s,
          x1: s.x1 + dx,
          y1: s.y1 + dy,
          x2: s.x2 + dx,
          y2: s.y2 + dy,
          x: s.x + dx,
          y: s.y + dy,
        };
      case "Q":
        return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x: s.x + dx, y: s.y + dy };
      default:
        return { ...s, x: s.x + dx, y: s.y + dy };
    }
  });
}

/**
 * Scale about a pivot. Arc radii scale with the geometry; a non-uniform scale
 * on an arc is only exactly right when the arc is unrotated, which is the case
 * for everything the shape generators emit and close enough for a drag.
 */
export function scalePath(
  segs: readonly Seg[],
  sx: number,
  sy: number,
  ox: number,
  oy: number,
): Seg[] {
  const px = (v: number) => ox + (v - ox) * sx;
  const py = (v: number) => oy + (v - oy) * sy;
  return segs.map((s) => {
    switch (s.cmd) {
      case "Z":
        return s;
      case "C":
        return {
          ...s,
          x1: px(s.x1),
          y1: py(s.y1),
          x2: px(s.x2),
          y2: py(s.y2),
          x: px(s.x),
          y: py(s.y),
        };
      case "Q":
        return { ...s, x1: px(s.x1), y1: py(s.y1), x: px(s.x), y: py(s.y) };
      case "A":
        return {
          ...s,
          rx: Math.abs(s.rx * sx),
          ry: Math.abs(s.ry * sy),
          x: px(s.x),
          y: py(s.y),
        };
      default:
        return { ...s, x: px(s.x), y: py(s.y) };
    }
  });
}

/** Convenience for the common case: parse, transform, serialize. */
export function mapPathString(
  d: string,
  fn: (segs: Seg[]) => Seg[],
): string {
  return serializePath(fn(parsePath(d)));
}
