// The isometric renderer: a plain 2D canvas, a fixed 2:1 projection, and the
// painter algorithm. No WebGL — the scene is a few thousand axis-aligned
// boxes, and staying on 2D keeps every colour a theme token resolved through
// the same probe the rest of the design system uses.
//
// World space is (x, z) on the ground plane with y up. Screen space is
//   sx = (x - z) * ISO_X
//   sy = (x + z) * ISO_Y - y * ISO_H
// so larger x + z is nearer the viewer, and drawing back-to-front is a sort.
//
// The light is fixed in *screen* space, up and to the left, so the shading and
// the contact shadows stay put as the scene turns underneath them.

import type { Block, Scene } from "./layout";
import {
  css,
  FACE_LEFT,
  FACE_RIGHT,
  FACE_TOP,
  mix,
  shade,
  type Palette,
  type Rgb,
} from "./palette";

const ISO_X = 0.5;
const ISO_Y = 0.25;
/** Height exaggeration. Higher reads as a city, lower as a floor plan. */
const ISO_H = 0.4;

/** How far the back of the plate fades toward the haze colour. Aerial
 *  perspective is the cheapest depth cue there is — it costs one blend per
 *  colour bucket and nothing per frame. */
const FOG_DARK = 0.34;
const FOG_LIGHT = 0.24;
/** Fog and the age fade are quantised into this many buckets so face colours
 *  stay cacheable — the eye cannot see the steps, and the cache stays small. */
const FOG_STEPS = 14;
const DIM_STEPS = 12;

export type Camera = {
  /** World point held at the centre of the viewport. */
  tx: number;
  tz: number;
  /** Pixels per world unit. */
  scale: number;
  /** Quarter turns, 0-3. */
  rot: number;
};

export type Viewport = { w: number; h: number };

export type Point = { sx: number; sy: number };

export function isoX(x: number, z: number): number {
  return (x - z) * ISO_X;
}

export function isoY(x: number, z: number, y: number): number {
  return (x + z) * ISO_Y - y * ISO_H;
}

/** Rotate a plan point by whole quarter turns about the scene centre. */
export function rotatePoint(
  x: number,
  z: number,
  rot: number,
  c: number,
): [number, number] {
  const dx = x - c;
  const dz = z - c;
  switch (((rot % 4) + 4) & 3) {
    case 1:
      return [c + dz, c - dx];
    case 2:
      return [c - dx, c - dz];
    case 3:
      return [c - dz, c + dx];
    default:
      return [c + dx, c + dz];
  }
}

/** A box stays axis-aligned under quarter turns, so rotating two opposite
 *  corners and re-normalising is all the transform we need. */
export function rotateRect(
  b: { x: number; z: number; w: number; d: number },
  rot: number,
  c: number,
): { x: number; z: number; w: number; d: number } {
  const [x1, z1] = rotatePoint(b.x, b.z, rot, c);
  const [x2, z2] = rotatePoint(b.x + b.w, b.z + b.d, rot, c);
  return {
    x: Math.min(x1, x2),
    z: Math.min(z1, z2),
    w: Math.abs(x2 - x1),
    d: Math.abs(z2 - z1),
  };
}

function screen(cam: Camera, vp: Viewport, ix: number, iy: number): Point {
  const ox = isoX(cam.tx, cam.tz);
  const oy = isoY(cam.tx, cam.tz, 0);
  return {
    sx: (ix - ox) * cam.scale + vp.w / 2,
    sy: (iy - oy) * cam.scale + vp.h / 2,
  };
}

export function project(
  cam: Camera,
  vp: Viewport,
  x: number,
  y: number,
  z: number,
): Point {
  return screen(cam, vp, isoX(x, z), isoY(x, z, y));
}

/**
 * Invert the projection for a delta on the ground plane. Panning and
 * zoom-to-cursor both need to turn a screen offset back into world units, and
 * neither should be re-deriving ISO_X/ISO_Y by hand.
 */
export function isoDeltaToWorld(dix: number, diy: number): { dx: number; dz: number } {
  const a = dix / ISO_X;
  const b = diy / ISO_Y;
  return { dx: (a + b) / 2, dz: (b - a) / 2 };
}

// ---------------------------------------------------------------------------
// Camera fitting
// ---------------------------------------------------------------------------

/** Scale + target that frames the whole scene with a comfortable margin. */
export function fitCamera(scene: Scene, vp: Viewport, rot = 0): Camera {
  const c = scene.extent / 2;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const consider = (ix: number, iy: number) => {
    if (ix < minX) minX = ix;
    if (ix > maxX) maxX = ix;
    if (iy < minY) minY = iy;
    if (iy > maxY) maxY = iy;
  };

  // The ground plate alone bounds x; heights only ever push the top edge up,
  // so the tallest block is enough to bound y.
  for (const [px, pz] of [
    [0, 0],
    [scene.extent, 0],
    [scene.extent, scene.extent],
    [0, scene.extent],
  ]) {
    const [rx, rz] = rotatePoint(px, pz, rot, c);
    consider(isoX(rx, rz), isoY(rx, rz, 0));
  }
  for (const b of scene.blocks) {
    if (b.h + b.y < 4) continue;
    const r = rotateRect(b, rot, c);
    consider(isoX(r.x, r.z), isoY(r.x, r.z, b.y + b.h));
  }

  const w = Math.max(1e-6, maxX - minX);
  const h = Math.max(1e-6, maxY - minY);
  const scale = Math.min(vp.w / w, vp.h / h) * 0.9;

  // Un-project the bounding-box centre back to a world target on y = 0.
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const tx = cx / (2 * ISO_X) + cy / (2 * ISO_Y);
  const tz = cy / (2 * ISO_Y) - cx / (2 * ISO_X);
  return { tx, tz, scale: Math.max(0.5, scale), rot };
}

// ---------------------------------------------------------------------------
// Painter order
// ---------------------------------------------------------------------------

type Prepared = Block & {
  rx: number;
  rz: number;
  rw: number;
  rd: number;
  /** 0 at the near corner of the plate, 1 at the far one. */
  fog: number;
};

/**
 * Back-to-front, depth-first down the terrace tree.
 *
 * Children always sit inside their parent's rect, so a pre-order walk paints
 * every terrace before anything standing on it, for free. That leaves only the
 * sibling problem, and siblings out of one squarified parent are disjoint —
 * which means the separating-axis test below is exact whenever it fires:
 * a box entirely on the +x or +z side of another is unambiguously nearer.
 *
 * Two cells can be separated diagonally (one is +x, the other +z), and then
 * neither occludes the other on screen; those fall through to the far-corner
 * sum, which is a scalar and therefore keeps the comparator a usable ordering.
 *
 * Sorting the whole scene by the *near* corner instead — which is what this
 * used to do — gets elongated treemap cells backwards. Measured over the six
 * repos in ~/Dev at all four rotations, that produced 3534 screen-overlapping
 * pairs in the wrong order on the largest; this produces 35.
 */
export function prepare(scene: Scene, rot: number): Prepared[] {
  const c = scene.extent / 2;
  const span = 2 * scene.extent;
  const nodes: Prepared[] = scene.blocks.map((b) => {
    const r = rotateRect(b, rot, c);
    const depthAlong = r.x + r.w / 2 + r.z + r.d / 2;
    return {
      ...b,
      rx: r.x,
      rz: r.z,
      rw: r.w,
      rd: r.d,
      fog: Math.max(0, Math.min(1, 1 - depthAlong / span)),
    };
  });

  const kids: number[][] = nodes.map(() => []);
  const roots: number[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const parent = scene.blocks[i].parent;
    // Parents are always emitted before their children, so a forward or
    // missing reference means this block is a root of its own.
    if (parent === null || parent < 0 || parent >= i) roots.push(i);
    else kids[parent].push(i);
  }

  const byNearest = (i: number, j: number): number => {
    const a = nodes[i];
    const b = nodes[j];
    const aFront = a.rx >= b.rx + b.rw - 1e-9 || a.rz >= b.rz + b.rd - 1e-9;
    const bFront = b.rx >= a.rx + a.rw - 1e-9 || b.rz >= a.rz + a.rd - 1e-9;
    if (aFront && !bFront) return 1;
    if (bFront && !aFront) return -1;
    return a.rx + a.rw + a.rz + a.rd - (b.rx + b.rw + b.rz + b.rd);
  };

  // Explicit stack: a vendored monorepo can nest deeper than is comfortable
  // for recursion, and pre-order with sorted siblings is the whole algorithm.
  const out: Prepared[] = [];
  const stack: number[] = [];
  roots.sort(byNearest);
  for (let i = roots.length - 1; i >= 0; i -= 1) stack.push(roots[i]);
  while (stack.length > 0) {
    const i = stack.pop()!;
    out.push(nodes[i]);
    const group = kids[i];
    if (group.length === 0) continue;
    group.sort(byNearest);
    for (let j = group.length - 1; j >= 0; j -= 1) stack.push(group[j]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Face colours
// ---------------------------------------------------------------------------

type FaceSet = {
  top: string;
  left: string;
  right: string;
  /** The sunlit edge along the two far roof lines. */
  hi: string;
};

/** Faces depend only on (what the block is, how far away it is), so they are
 *  cached per palette and reused across frames. The cache hangs off the
 *  palette object, which means a theme change throws it away by itself. */
const FACE_CACHE = new WeakMap<Palette, Map<string, FaceSet>>();

function facesFor(b: Prepared, p: Palette): FaceSet {
  let table = FACE_CACHE.get(p);
  if (!table) {
    table = new Map();
    FACE_CACHE.set(p, table);
  }
  const step = Math.round(b.fog * FOG_STEPS);
  const dimStep = Math.round(b.dim * DIM_STEPS);
  const key = `${b.terrace ? `t${b.depth}` : b.lang}|${step}|${dimStep}|${b.dirty ? 1 : 0}`;
  const hit = table.get(key);
  if (hit) return hit;

  const built = buildFaces(baseColor(b, p), p, step / FOG_STEPS, dimStep / DIM_STEPS);
  table.set(key, built);
  return built;
}

function baseColor(b: Prepared, p: Palette): Rgb {
  const base = b.terrace ? p.terrace(b.depth) : p.lang(b.lang);
  // A dirty terrace gets a whisper of coral so you can see which wing of the
  // repo has changes without being able to read a single building.
  if (!b.dirty) return base;
  return mix(base, p.brand, b.terrace ? 0.14 : 0.45);
}

function buildFaces(base: Rgb, p: Palette, fog: number, dim = 0): FaceSet {
  // The age fade rides the same haze as distance does, so a repo you have not
  // touched in a year reads as further away rather than as a different colour.
  const aged = dim > 0 ? mix(base, p.haze, dim) : base;
  const hazed = mix(aged, p.haze, fog * (p.isDark ? FOG_DARK : FOG_LIGHT));
  return {
    top: css(shade(hazed, FACE_TOP)),
    left: css(shade(hazed, FACE_LEFT)),
    right: css(shade(hazed, FACE_RIGHT)),
    hi: css(mix(shade(hazed, FACE_TOP), p.isDark ? WHITE : p.foreground, 0.3), 0.5),
  };
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };

// ---------------------------------------------------------------------------
// Backdrop
// ---------------------------------------------------------------------------

type Backdrop = { w: number; h: number; sky: CanvasGradient; vignette: CanvasGradient };

const BACKDROP_CACHE = new WeakMap<Palette, Backdrop>();

function backdrop(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  p: Palette,
): Backdrop {
  const hit = BACKDROP_CACHE.get(p);
  if (hit && hit.w === vp.w && hit.h === vp.h) return hit;

  const sky = ctx.createLinearGradient(0, 0, 0, vp.h);
  sky.addColorStop(0, css(p.skyTop));
  sky.addColorStop(0.62, css(mix(p.skyTop, p.skyBottom, 0.85)));
  sky.addColorStop(1, css(p.skyBottom));

  // Radius reaches the corners, so the falloff is even rather than elliptical
  // in a way that tracks the window aspect.
  const r = Math.hypot(vp.w, vp.h) / 2;
  const vignette = ctx.createRadialGradient(
    vp.w / 2,
    vp.h * 0.46,
    r * 0.45,
    vp.w / 2,
    vp.h * 0.46,
    r,
  );
  vignette.addColorStop(0, css(p.shadow, 0));
  vignette.addColorStop(1, css(p.shadow, p.isDark ? 0.42 : 0.14));

  const made: Backdrop = { w: vp.w, h: vp.h, sky, vignette };
  BACKDROP_CACHE.set(p, made);
  return made;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

export type RenderOptions = {
  palette: Palette;
  hoverId: number | null;
  selectedId: number | null;
  /** Directory/plot names on terraces wide enough to hold them. */
  showLabels: boolean;
};

type Label = { sx: number; sy: number; text: string; size: number; alpha: number };
type Pin = { sx: number; sy: number; staged: boolean };

/** Below this many pixels wide a building cannot show its coral outline, so it
 *  gets a screen-space pin instead — the whole point of the view is that you
 *  can see where the uncommitted work is from the fitted camera. */
const PIN_BELOW_PX = 7;
const MAX_PINS = 240;

export function renderScene(
  ctx: CanvasRenderingContext2D,
  prepared: Prepared[],
  scene: Scene,
  cam: Camera,
  vp: Viewport,
  opts: RenderOptions,
): void {
  const { palette: p } = opts;
  const paper = backdrop(ctx, vp, p);

  ctx.clearRect(0, 0, vp.w, vp.h);
  ctx.fillStyle = paper.sky;
  ctx.fillRect(0, 0, vp.w, vp.h);
  drawGround(ctx, scene, cam, vp, p);

  const labels: Label[] = [];
  const pins: Pin[] = [];
  const shadowInk = css(p.shadow, p.isDark ? 0.36 : 0.22);
  const seam = css(p.background, p.isDark ? 0.5 : 0.35);
  const margin = 64;

  for (const b of prepared) {
    const top = b.y + b.h;
    const a = screen(cam, vp, isoX(b.rx, b.rz), isoY(b.rx, b.rz, top));
    const right = screen(
      cam,
      vp,
      isoX(b.rx + b.rw, b.rz),
      isoY(b.rx + b.rw, b.rz, top),
    );
    const near = screen(
      cam,
      vp,
      isoX(b.rx + b.rw, b.rz + b.rd),
      isoY(b.rx + b.rw, b.rz + b.rd, top),
    );
    const left = screen(
      cam,
      vp,
      isoX(b.rx, b.rz + b.rd),
      isoY(b.rx, b.rz + b.rd, top),
    );
    const nearBase = screen(
      cam,
      vp,
      isoX(b.rx + b.rw, b.rz + b.rd),
      isoY(b.rx + b.rw, b.rz + b.rd, b.y),
    );
    const rightBase = screen(
      cam,
      vp,
      isoX(b.rx + b.rw, b.rz),
      isoY(b.rx + b.rw, b.rz, b.y),
    );
    const leftBase = screen(
      cam,
      vp,
      isoX(b.rx, b.rz + b.rd),
      isoY(b.rx, b.rz + b.rd, b.y),
    );

    // Cull: cheap screen-space bounds against the padded viewport.
    const minSx = Math.min(a.sx, left.sx);
    const maxSx = Math.max(right.sx, near.sx);
    const minSy = a.sy;
    const maxSy = nearBase.sy;
    if (maxSx < -margin || minSx > vp.w + margin) continue;
    if (maxSy < -margin || minSy > vp.h + margin) continue;

    const hovered = b.id === opts.hoverId;
    const selected = b.id === opts.selectedId;
    const wide = Math.abs(near.sx - left.sx);
    const tall = nearBase.sy - near.sy;

    // Contact shadow: the footprint, nudged down and to the right by an amount
    // that grows with the building, dropped onto whatever is already painted.
    // One extra fill per tower, and it is the difference between a model and a
    // pile of stickers.
    if (!b.terrace && wide > 1.6 && tall > 1) {
      const off = Math.min(16, Math.max(0.8, tall * 0.3));
      const aBase = screen(cam, vp, isoX(b.rx, b.rz), isoY(b.rx, b.rz, b.y));
      ctx.fillStyle = shadowInk;
      ctx.beginPath();
      ctx.moveTo(aBase.sx + off * 0.95, aBase.sy + off * 0.5);
      ctx.lineTo(rightBase.sx + off * 0.95, rightBase.sy + off * 0.5);
      ctx.lineTo(nearBase.sx + off * 0.95, nearBase.sy + off * 0.5);
      ctx.lineTo(leftBase.sx + off * 0.95, leftBase.sy + off * 0.5);
      ctx.closePath();
      ctx.fill();
    }

    const faces =
      hovered || selected
        ? buildFaces(
            mix(baseColor(b, p), p.foreground, p.isDark ? 0.22 : 0.14),
            p,
            b.fog,
            // Hovering wakes a sleeping repo up rather than lifting a faded one.
            0,
          )
        : facesFor(b, p);

    // Left wall (toward the light) then right wall, then the roof.
    fillPoly(ctx, [left, near, nearBase, leftBase], faces.left);
    fillPoly(ctx, [right, near, nearBase, rightBase], faces.right);
    fillPoly(ctx, [a, right, near, left], faces.top);

    if (wide > 5) {
      ctx.strokeStyle = seam;
      ctx.lineWidth = 1;
      strokePoly(ctx, [a, right, near, left]);
    }

    // Sunlit edge along the two roof lines the light actually reaches. Only
    // worth the stroke once a building is big enough to read it.
    if (wide > 11) {
      ctx.strokeStyle = faces.hi;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left.sx, left.sy);
      ctx.lineTo(a.sx, a.sy);
      ctx.lineTo(right.sx, right.sy);
      ctx.stroke();
    }

    if (b.dirty && !b.terrace) {
      // Working-tree state is the one place brand coral is allowed here.
      if (wide < PIN_BELOW_PX) {
        if (pins.length < MAX_PINS) {
          pins.push({ sx: a.sx, sy: a.sy, staged: b.status !== "?" });
        }
      } else {
        ctx.save();
        ctx.shadowColor = css(p.brand, 0.8);
        ctx.shadowBlur = 7;
        ctx.strokeStyle = css(p.brand, 0.95);
        ctx.lineWidth = b.status === "?" ? 1 : 1.6;
        strokePoly(ctx, [a, right, near, left]);
        ctx.restore();
      }
    }

    if (hovered || selected) {
      ctx.save();
      ctx.shadowColor = css(p.brand, 0.9);
      ctx.shadowBlur = selected ? 12 : 8;
      ctx.strokeStyle = css(p.brand, selected ? 1 : 0.75);
      ctx.lineWidth = selected ? 2 : 1.5;
      strokePoly(ctx, [a, right, near, left]);
      strokePoly(ctx, [left, near, nearBase, leftBase]);
      strokePoly(ctx, [right, near, nearBase, rightBase]);
      ctx.restore();
    }

    // Only the outer terraces get names; deeper ones would stack on top of
    // each other and of the buildings standing on them.
    if (opts.showLabels && b.terrace && b.depth <= 1 && wide > 70) {
      labels.push({
        sx: (a.sx + near.sx) / 2,
        sy: (a.sy + near.sy) / 2,
        text: b.label,
        size: Math.max(9, Math.min(14, wide / 9)),
        alpha: Math.min(0.9, 0.35 + wide / 400) * (1 - b.dim * 0.75),
      });
    }
    // Whatever the pointer is on says its own name, however deep it sits.
    if (hovered && !(opts.showLabels && b.terrace && b.depth <= 1 && wide > 70)) {
      labels.push({
        sx: a.sx + (near.sx - a.sx) / 2,
        sy: Math.min(a.sy, near.sy) - 9,
        text: b.label,
        size: 12,
        alpha: 1,
      });
    }
  }

  drawPins(ctx, pins, p);
  drawLabels(ctx, labels, p);

  ctx.fillStyle = paper.vignette;
  ctx.fillRect(0, 0, vp.w, vp.h);
}

function fillPoly(ctx: CanvasRenderingContext2D, pts: Point[], color: string): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].sx, pts[0].sy);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].sx, pts[i].sy);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function strokePoly(ctx: CanvasRenderingContext2D, pts: Point[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].sx, pts[0].sy);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].sx, pts[i].sy);
  ctx.closePath();
  ctx.stroke();
}

function drawGround(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  cam: Camera,
  vp: Viewport,
  p: Palette,
): void {
  const e = scene.extent;
  const c = e / 2;
  const corners = ([
    [0, 0],
    [e, 0],
    [e, e],
    [0, e],
  ] as [number, number][]).map(([x, z]) => {
    const [rx, rz] = rotatePoint(x, z, cam.rot, c);
    return screen(cam, vp, isoX(rx, rz), isoY(rx, rz, 0));
  });

  // The plate throws its own shadow, which is what separates it from the sky.
  ctx.save();
  ctx.shadowColor = css(p.shadow, p.isDark ? 0.7 : 0.28);
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 10;
  fillPoly(ctx, corners, css(p.ground));
  ctx.restore();

  ctx.strokeStyle = css(p.border, 0.8);
  ctx.lineWidth = 1;
  strokePoly(ctx, corners);

  // A grid every tenth of the plate, but only once it is worth drawing.
  const step = e / 10;
  if (step * cam.scale * ISO_X < 9) return;
  ctx.strokeStyle = css(p.border, p.isDark ? 0.35 : 0.45);
  ctx.lineWidth = 1;
  for (let i = 1; i < 10; i += 1) {
    const t = i * step;
    for (const [ax, az, bx, bz] of [
      [t, 0, t, e],
      [0, t, e, t],
    ]) {
      const [rax, raz] = rotatePoint(ax, az, cam.rot, c);
      const [rbx, rbz] = rotatePoint(bx, bz, cam.rot, c);
      const from = screen(cam, vp, isoX(rax, raz), isoY(rax, raz, 0));
      const to = screen(cam, vp, isoX(rbx, rbz), isoY(rbx, rbz, 0));
      ctx.beginPath();
      ctx.moveTo(from.sx, from.sy);
      ctx.lineTo(to.sx, to.sy);
      ctx.stroke();
    }
  }
}

/** Coral markers for files too small on screen to carry an outline. Hollow for
 *  untracked, solid for anything git is already tracking — the same split the
 *  outline weight makes when there is room for one. */
function drawPins(ctx: CanvasRenderingContext2D, pins: Pin[], p: Palette): void {
  if (pins.length === 0) return;
  ctx.save();
  ctx.shadowColor = css(p.brand, 0.85);
  ctx.shadowBlur = 6;
  ctx.strokeStyle = css(p.brand, 0.95);
  ctx.fillStyle = css(p.brand, 0.95);
  ctx.lineWidth = 1;
  for (const pin of pins) {
    const r = 2.6;
    ctx.beginPath();
    ctx.moveTo(pin.sx, pin.sy - r - 3);
    ctx.lineTo(pin.sx + r, pin.sy - 3);
    ctx.lineTo(pin.sx, pin.sy + r - 3);
    ctx.lineTo(pin.sx - r, pin.sy - 3);
    ctx.closePath();
    if (pin.staged) ctx.fill();
    else ctx.stroke();
  }
  ctx.restore();
}

function drawLabels(
  ctx: CanvasRenderingContext2D,
  labels: Label[],
  p: Palette,
): void {
  if (labels.length === 0) return;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  for (const l of labels) {
    ctx.font = `600 ${l.size}px Inter, ui-sans-serif, system-ui, sans-serif`;
    // Halo first so a name stays readable over whatever it lands on.
    ctx.lineWidth = 3;
    ctx.strokeStyle = css(p.background, 0.7);
    ctx.strokeText(l.text, l.sx, l.sy);
    ctx.fillStyle = css(p.foreground, l.alpha);
    ctx.fillText(l.text, l.sx, l.sy);
  }
}

// ---------------------------------------------------------------------------
// Picking
// ---------------------------------------------------------------------------

/** Front-to-back point test against the three visible faces of each box.
 *  Exact, and cheap enough for a few thousand boxes on every mouse move. */
export function hitTest(
  prepared: Prepared[],
  cam: Camera,
  vp: Viewport,
  px: number,
  py: number,
): Block | null {
  for (let i = prepared.length - 1; i >= 0; i -= 1) {
    const b = prepared[i];
    const top = b.y + b.h;
    const a = project2(cam, vp, b.rx, top, b.rz);
    const right = project2(cam, vp, b.rx + b.rw, top, b.rz);
    const near = project2(cam, vp, b.rx + b.rw, top, b.rz + b.rd);
    const left = project2(cam, vp, b.rx, top, b.rz + b.rd);
    const nearBase = project2(cam, vp, b.rx + b.rw, b.y, b.rz + b.rd);
    const rightBase = project2(cam, vp, b.rx + b.rw, b.y, b.rz);
    const leftBase = project2(cam, vp, b.rx, b.y, b.rz + b.rd);

    if (
      inPoly(px, py, [a, right, near, left]) ||
      inPoly(px, py, [left, near, nearBase, leftBase]) ||
      inPoly(px, py, [right, near, nearBase, rightBase])
    ) {
      return b;
    }
  }
  return null;
}

function project2(
  cam: Camera,
  vp: Viewport,
  x: number,
  y: number,
  z: number,
): Point {
  return screen(cam, vp, isoX(x, z), isoY(x, z, y));
}

function inPoly(px: number, py: number, pts: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const xi = pts[i].sx;
    const yi = pts[i].sy;
    const xj = pts[j].sx;
    const yj = pts[j].sy;
    const intersects =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export type { Prepared };
