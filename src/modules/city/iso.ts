// The isometric renderer: a plain 2D canvas, a fixed 2:1 projection, and the
// painter algorithm. No WebGL — the scene is a few thousand axis-aligned
// boxes, and staying on 2D keeps every colour a theme token resolved through
// the same probe the rest of the design system uses.
//
// World space is (x, z) on the ground plane with y up. Screen space is
//   sx = (x - z) * ISO_X
//   sy = (x + z) * ISO_Y - y * ISO_H
// so larger x + z is nearer the viewer, and drawing back-to-front is a sort.

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
function rotatePoint(x: number, z: number, rot: number, c: number): [number, number] {
  const dx = x - c;
  const dz = z - c;
  switch (rot & 3) {
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
};

/**
 * Back-to-front. Children of a terrace always sit inside their parent rect,
 * so their far corner sum is never smaller — the parent slab is painted
 * first for free. Siblings are disjoint with a gap between them, which is
 * what makes the far-corner sum a safe ordering in practice.
 */
export function prepare(scene: Scene, rot: number): Prepared[] {
  const c = scene.extent / 2;
  const out = scene.blocks.map((b) => {
    const r = rotateRect(b, rot, c);
    return { ...b, rx: r.x, rz: r.z, rw: r.w, rd: r.d };
  });
  out.sort((a, b) => a.rx + a.rz - (b.rx + b.rz) || a.y - b.y || a.depth - b.depth);
  return out;
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

export function renderScene(
  ctx: CanvasRenderingContext2D,
  prepared: Prepared[],
  scene: Scene,
  cam: Camera,
  vp: Viewport,
  opts: RenderOptions,
): void {
  const { palette: p } = opts;

  ctx.clearRect(0, 0, vp.w, vp.h);
  drawGround(ctx, scene, cam, vp, p);

  const labels: Label[] = [];
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
    const base = faceColor(b, p, hovered || selected);
    const wide = Math.abs(near.sx - left.sx);
    const detailed = wide > 5;

    // Left wall (toward the light) then right wall, then the roof.
    fillPoly(ctx, [left, near, nearBase, leftBase], css(shade(base, FACE_LEFT)));
    fillPoly(ctx, [right, near, nearBase, rightBase], css(shade(base, FACE_RIGHT)));
    fillPoly(ctx, [a, right, near, left], css(shade(base, FACE_TOP)));

    if (detailed) {
      ctx.strokeStyle = css(p.background, p.isDark ? 0.5 : 0.35);
      ctx.lineWidth = 1;
      strokePoly(ctx, [a, right, near, left]);
    }

    if (b.dirty && !b.terrace) {
      // Working-tree state is the one place brand coral is allowed here.
      ctx.strokeStyle = css(p.brand, 0.95);
      ctx.lineWidth = b.status === "?" ? 1 : 1.6;
      strokePoly(ctx, [a, right, near, left]);
    }

    if (hovered || selected) {
      ctx.strokeStyle = css(p.brand, selected ? 1 : 0.75);
      ctx.lineWidth = selected ? 2 : 1.5;
      strokePoly(ctx, [a, right, near, left]);
      strokePoly(ctx, [left, near, nearBase, leftBase]);
      strokePoly(ctx, [right, near, nearBase, rightBase]);
    }

    // Only the outer terraces get names; deeper ones would stack on top of
    // each other and of the buildings standing on them.
    if (opts.showLabels && b.terrace && b.depth <= 1 && wide > 70) {
      labels.push({
        sx: (a.sx + near.sx) / 2,
        sy: (a.sy + near.sy) / 2,
        text: b.label,
        size: Math.max(9, Math.min(14, wide / 9)),
        alpha: Math.min(0.9, 0.35 + wide / 400),
      });
    }
  }

  drawLabels(ctx, labels, p);
}

function faceColor(b: Block, p: Palette, lifted: boolean): Rgb {
  let base = b.terrace ? p.terrace(b.depth) : p.lang(b.lang);
  if (b.dirty && !b.terrace) base = mix(base, p.brand, 0.45);
  if (lifted) base = mix(base, p.foreground, p.isDark ? 0.22 : 0.14);
  return base;
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

  fillPoly(ctx, corners, css(p.ground));
  ctx.strokeStyle = css(p.border, 0.8);
  ctx.lineWidth = 1;
  strokePoly(ctx, corners);

  // A grid every tenth of the plate, but only once it is worth drawing.
  const step = e / 10;
  if (step * cam.scale * ISO_X < 9) return;
  ctx.strokeStyle = css(p.border, p.isDark ? 0.45 : 0.55);
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
