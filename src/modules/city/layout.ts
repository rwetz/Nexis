// Turning repos and file trees into boxes on a plane.
//
// Both views are squarified treemaps (Bruls/Huizing/van Wijk): the plan is a
// treemap, and the third dimension is extrusion. Footprint therefore answers
// "how much is in here" and height answers "how big is this one thing" — a
// file that is one enormous module reads as a tower on a normal plot rather
// than as a sprawling estate.
//
// Layout is deterministic: the Rust side already sorts children biggest-first,
// so refreshing a repo you have not touched redraws the identical city.

import type { LangSlice, RepoSummary, TreeNode } from "./types";
import { dirtyCount } from "./types";

export type Rect = { x: number; z: number; w: number; d: number };

export type BlockRef =
  | { kind: "repo"; repo: RepoSummary }
  | { kind: "district"; repo: RepoSummary; slice: LangSlice }
  | { kind: "dir"; node: TreeNode }
  | { kind: "file"; node: TreeNode };

export type Block = {
  id: number;
  ref: BlockRef;
  /** Plan rect, world units. */
  x: number;
  z: number;
  w: number;
  d: number;
  /** Base elevation and extrusion, world units. */
  y: number;
  h: number;
  /** Nesting level — terraces tint by it, labels shrink by it. */
  depth: number;
  /** A terrace (directory / repo plot) rather than an extruded thing. */
  terrace: boolean;
  lang: string;
  dirty: boolean;
  status: string | null;
  label: string;
};

export type Scene = {
  blocks: Block[];
  /** Square world extent; the camera fits to this. */
  extent: number;
  /** Blocks dropped to keep the renderer responsive. */
  omitted: number;
};

/** World extent of both scenes. Everything else is expressed against it. */
export const EXTENT = 100;

const TERRACE_H = 0.55;
const PLOT_H = 0.8;
const BUILDING_SCALE = 1.95;
/** Past this the canvas stops being interactive on a laptop GPU-less path. */
const MAX_BLOCKS = 12_000;

// ---------------------------------------------------------------------------
// Squarified treemap
// ---------------------------------------------------------------------------

type Weighted<T> = { weight: number; data: T };
type Placed<T> = { rect: Rect; data: T };

/** Lay `items` out inside `rect`, favouring square-ish cells. */
export function squarify<T>(items: Weighted<T>[], rect: Rect): Placed<T>[] {
  const out: Placed<T>[] = [];
  const total = items.reduce((s, i) => s + Math.max(0, i.weight), 0);
  if (total <= 0 || rect.w <= 0 || rect.d <= 0) return out;

  const scale = (rect.w * rect.d) / total;
  const queue = items
    .filter((i) => i.weight > 0)
    .map((i) => ({ area: i.weight * scale, data: i.data }));

  const free: Rect = { ...rect };
  while (queue.length > 0 && free.w > 1e-6 && free.d > 1e-6) {
    const short = Math.min(free.w, free.d);
    const row: { area: number; data: T }[] = [];
    let rowArea = 0;
    let bestRatio = Infinity;

    while (queue.length > 0) {
      const next = queue[0];
      const areas = row.map((r) => r.area).concat(next.area);
      const ratio = worst(areas, rowArea + next.area, short);
      if (row.length === 0 || ratio <= bestRatio) {
        row.push(queue.shift()!);
        rowArea += next.area;
        bestRatio = ratio;
      } else {
        break;
      }
    }

    if (rowArea <= 0) break;

    if (free.w <= free.d) {
      // Row runs left-to-right across the full width.
      const rowDepth = Math.min(free.d, rowArea / free.w);
      let x = free.x;
      for (const item of row) {
        const w = rowDepth > 0 ? item.area / rowDepth : 0;
        out.push({ rect: { x, z: free.z, w, d: rowDepth }, data: item.data });
        x += w;
      }
      free.z += rowDepth;
      free.d -= rowDepth;
    } else {
      // Row runs front-to-back down the full depth.
      const rowWidth = Math.min(free.w, rowArea / free.d);
      let z = free.z;
      for (const item of row) {
        const d = rowWidth > 0 ? item.area / rowWidth : 0;
        out.push({ rect: { x: free.x, z, w: rowWidth, d }, data: item.data });
        z += d;
      }
      free.x += rowWidth;
      free.w -= rowWidth;
    }
  }

  return out;
}

/** Worst aspect ratio in a candidate row — the squarify cost function. */
function worst(areas: number[], sum: number, side: number): number {
  if (sum <= 0 || side <= 0) return Infinity;
  let max = -Infinity;
  let min = Infinity;
  for (const a of areas) {
    if (a > max) max = a;
    if (a < min) min = a;
  }
  if (min <= 0) return Infinity;
  const s2 = sum * sum;
  const side2 = side * side;
  return Math.max((side2 * max) / s2, s2 / (side2 * min));
}

function inset(rect: Rect, by: number): Rect {
  const w = Math.max(0, rect.w - by * 2);
  const d = Math.max(0, rect.d - by * 2);
  return { x: rect.x + (rect.w - w) / 2, z: rect.z + (rect.d - d) / 2, w, d };
}

/** Gaps shrink with the cell so deep nesting does not eat the whole plot. */
function gapFor(rect: Rect): number {
  return Math.min(0.9, Math.min(rect.w, rect.d) * 0.09);
}

// ---------------------------------------------------------------------------
// City — one repo, drilled in
// ---------------------------------------------------------------------------

/** Lines of code, falling back to a byte estimate for files we did not read. */
export function loc(node: TreeNode): number {
  return node.lines > 0 ? node.lines : node.bytes / 45;
}

function buildingHeight(node: TreeNode): number {
  return 0.7 + Math.log2(1 + loc(node)) * BUILDING_SCALE;
}

/** Footprint weight. Sublinear in size so one huge file does not swallow the
 *  block — its bulk shows up as height instead. */
function fileWeight(node: TreeNode): number {
  return 1 + Math.sqrt(loc(node)) / 12;
}

function subtreeWeight(node: TreeNode, cache: Map<TreeNode, number>): number {
  const hit = cache.get(node);
  if (hit !== undefined) return hit;
  let value: number;
  if (!node.is_dir) {
    value = fileWeight(node);
  } else {
    // The constant is the terrace border the children never get to use.
    value = 0.6 + node.children.reduce((s, c) => s + subtreeWeight(c, cache), 0);
  }
  cache.set(node, value);
  return value;
}

export function layoutCity(root: TreeNode): Scene {
  const blocks: Block[] = [];
  const weights = new Map<TreeNode, number>();
  let omitted = 0;
  let nextId = 1;

  const placeDir = (node: TreeNode, rect: Rect, depth: number, y: number) => {
    blocks.push({
      id: nextId++,
      ref: { kind: "dir", node },
      ...rect,
      y,
      h: TERRACE_H,
      depth,
      terrace: true,
      lang: node.lang,
      dirty: node.dirty > 0,
      status: null,
      label: node.name,
    });

    const top = y + TERRACE_H;
    const inner = inset(rect, gapFor(rect));
    if (inner.w <= 0.05 || inner.d <= 0.05) {
      omitted += countNodes(node);
      return;
    }

    const children = node.children.filter((c) => !c.is_dir || c.children.length > 0);
    const placed = squarify(
      children.map((c) => ({ weight: subtreeWeight(c, weights), data: c })),
      inner,
    );

    for (const { rect: cell, data: child } of placed) {
      if (blocks.length >= MAX_BLOCKS) {
        omitted += 1;
        continue;
      }
      if (child.is_dir) {
        placeDir(child, cell, depth + 1, top);
        continue;
      }
      const foot = inset(cell, gapFor(cell));
      if (foot.w <= 0.02 || foot.d <= 0.02) {
        omitted += 1;
        continue;
      }
      blocks.push({
        id: nextId++,
        ref: { kind: "file", node: child },
        ...foot,
        y: top,
        h: buildingHeight(child),
        depth: depth + 1,
        terrace: false,
        lang: child.lang,
        dirty: child.status !== null,
        status: child.status,
        label: child.name,
      });
    }
  };

  placeDir(root, { x: 0, z: 0, w: EXTENT, d: EXTENT }, 0, 0);
  return { blocks, extent: EXTENT, omitted };
}

function countNodes(node: TreeNode): number {
  return node.children.reduce((s, c) => s + countNodes(c), 1);
}

// ---------------------------------------------------------------------------
// Atlas — every repo at once
// ---------------------------------------------------------------------------

export function layoutAtlas(repos: RepoSummary[]): Scene {
  const blocks: Block[] = [];
  let nextId = 1;

  const plots = squarify(
    repos.map((r) => ({ weight: 2 + Math.sqrt(Math.max(1, r.files)), data: r })),
    { x: 0, z: 0, w: EXTENT, d: EXTENT },
  );

  for (const { rect, data: repo } of plots) {
    const plot = inset(rect, gapFor(rect));
    if (plot.w <= 0.2 || plot.d <= 0.2) continue;

    blocks.push({
      id: nextId++,
      ref: { kind: "repo", repo },
      ...plot,
      y: 0,
      h: PLOT_H,
      depth: 0,
      terrace: true,
      lang: repo.langs[0]?.lang ?? "Other",
      dirty: dirtyCount(repo) > 0,
      status: null,
      label: repo.name,
    });

    // The skyline: one tower per language. Same rule as the city — footprint
    // counts how many files, height measures how much they weigh. Sizing the
    // footprint by bytes instead would hand 95% of every plot to whichever
    // repo happens to check in a few megabytes of images.
    const inner = inset(plot, gapFor(plot) * 1.6);
    if (inner.w <= 0.1 || inner.d <= 0.1) continue;
    const towers = squarify(
      repo.langs.map((s) => ({ weight: 1 + Math.sqrt(s.files), data: s })),
      inner,
    );
    for (const { rect: cell, data: slice } of towers) {
      const foot = inset(cell, gapFor(cell));
      if (foot.w <= 0.05 || foot.d <= 0.05) continue;
      blocks.push({
        id: nextId++,
        ref: { kind: "district", repo, slice },
        ...foot,
        y: PLOT_H,
        h: 0.9 + Math.log2(1 + slice.bytes / 1024) * 1.05,
        depth: 1,
        terrace: false,
        lang: slice.lang,
        dirty: false,
        status: null,
        label: slice.lang,
      });
    }
  }

  return { blocks, extent: EXTENT, omitted: 0 };
}
