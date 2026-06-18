// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// A pane tree is content-agnostic: the leaf carries a payload `L` (terminal
// leaves store `{ cwd? }`, editor leaves store `{ path, dirty?, preview? }`).
// All structural operations below are generic over `L`; the only payload-aware
// helpers are `findLeaf`/`updateLeaf` and the terminal-specific `findLeafCwd`/
// `setLeafCwd` wrappers at the bottom.

export type PaneId = number;

export type SplitDir = "row" | "col";

export type PaneLeaf<L extends object> = { kind: "leaf"; id: PaneId } & L;

export type PaneSplit<L extends object> = {
  kind: "split";
  id: PaneId;
  dir: SplitDir;
  children: PaneNode<L>[];
};

export type PaneNode<L extends object> = PaneLeaf<L> | PaneSplit<L>;

export function isLeaf<L extends object>(
  n: PaneNode<L>,
): n is PaneLeaf<L> {
  return n.kind === "leaf";
}

export function leafIds<L extends object>(n: PaneNode<L>): PaneId[] {
  if (isLeaf(n)) return [n.id];
  return n.children.flatMap(leafIds);
}

/** All leaves, left-to-right. Handy for reading per-leaf payload (paths, etc.). */
export function leaves<L extends object>(n: PaneNode<L>): PaneLeaf<L>[] {
  if (isLeaf(n)) return [n];
  return n.children.flatMap(leaves);
}

/** The leaf with `id`, or undefined. */
export function findLeaf<L extends object>(
  n: PaneNode<L>,
  id: PaneId,
): PaneLeaf<L> | undefined {
  if (isLeaf(n)) return n.id === id ? n : undefined;
  for (const c of n.children) {
    const found = findLeaf(c, id);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * Merge `patch` into the leaf with `id`. Referentially stable: returns the same
 * node (and same ancestors) when the patch changes nothing, so React selectors
 * don't see spurious new references.
 */
export function updateLeaf<L extends object>(
  n: PaneNode<L>,
  id: PaneId,
  patch: Partial<L>,
): PaneNode<L> {
  if (isLeaf(n)) {
    if (n.id !== id) return n;
    let changed = false;
    for (const k in patch) {
      if (
        (n as Record<string, unknown>)[k] !==
        (patch as Record<string, unknown>)[k]
      ) {
        changed = true;
        break;
      }
    }
    if (!changed) return n;
    return { ...n, ...patch };
  }
  let changed = false;
  const next = n.children.map((c) => {
    const u = updateLeaf(c, id, patch);
    if (u !== c) changed = true;
    return u;
  });
  return changed ? { ...n, children: next } : n;
}

/**
 * Insert a new leaf next to `targetId` in direction `dir`.
 *
 * If the target's enclosing split already runs in `dir`, the new leaf is
 * appended as a sibling there (avoids nested same-direction splits — keeps
 * the tree shallow and the resize handles aligned).
 */
export function splitLeaf<L extends object>(
  tree: PaneNode<L>,
  targetId: PaneId,
  newSplitId: PaneId,
  newLeafId: PaneId,
  dir: SplitDir,
  newLeafData: L,
): PaneNode<L> {
  const newLeaf = Object.assign(
    { kind: "leaf" as const, id: newLeafId },
    newLeafData,
  ) as PaneLeaf<L>;
  if (tree.kind === "split" && tree.dir === dir) {
    const idx = tree.children.findIndex(
      (c) => c.kind === "leaf" && c.id === targetId,
    );
    if (idx >= 0) {
      return {
        ...tree,
        children: [
          ...tree.children.slice(0, idx + 1),
          newLeaf,
          ...tree.children.slice(idx + 1),
        ],
      };
    }
  }
  if (isLeaf(tree)) {
    if (tree.id !== targetId) return tree;
    return {
      kind: "split",
      id: newSplitId,
      dir,
      children: [tree, newLeaf],
    };
  }
  return {
    ...tree,
    children: tree.children.map((c) =>
      splitLeaf(c, targetId, newSplitId, newLeafId, dir, newLeafData),
    ),
  };
}

/**
 * Remove a leaf and collapse single-child splits left in its wake. Returns
 * `null` when the entire subtree is gone.
 */
export function removeLeaf<L extends object>(
  tree: PaneNode<L>,
  targetId: PaneId,
): PaneNode<L> | null {
  if (isLeaf(tree)) return tree.id === targetId ? null : tree;
  const newChildren: PaneNode<L>[] = [];
  for (const c of tree.children) {
    const r = removeLeaf(c, targetId);
    if (r !== null) newChildren.push(r);
  }
  if (newChildren.length === 0) return null;
  if (newChildren.length === 1) return newChildren[0];
  return { ...tree, children: newChildren };
}

/**
 * Reorder a leaf within its enclosing split by swapping it with the adjacent
 * sibling. `axis` selects which split orientation the move applies to ("col"
 * for up/down, "row" for left/right) and `delta` the direction (-1 = up/left,
 * +1 = down/right).
 *
 * The move only happens when the leaf's *immediate* parent split runs along
 * `axis` — predictable, and sufficient because `splitLeaf` already flattens
 * same-direction splits so siblings share their parent's orientation. No-op at
 * an edge, or when the parent's orientation doesn't match the requested axis.
 */
export function movePane<L extends object>(
  tree: PaneNode<L>,
  leafId: PaneId,
  axis: SplitDir,
  delta: 1 | -1,
): PaneNode<L> {
  if (isLeaf(tree)) return tree;
  const idx = tree.children.findIndex(
    (c) => c.kind === "leaf" && c.id === leafId,
  );
  if (idx >= 0) {
    if (tree.dir !== axis) return tree;
    const target = idx + delta;
    if (target < 0 || target >= tree.children.length) return tree;
    const next = tree.children.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    return { ...tree, children: next };
  }
  let changed = false;
  const nextChildren = tree.children.map((c) => {
    const u = movePane(c, leafId, axis, delta);
    if (u !== c) changed = true;
    return u;
  });
  return changed ? { ...tree, children: nextChildren } : tree;
}

export function nextLeafId<L extends object>(
  tree: PaneNode<L>,
  currentId: PaneId,
  delta: 1 | -1,
): PaneId {
  const ids = leafIds(tree);
  if (ids.length === 0) return currentId;
  const idx = ids.indexOf(currentId);
  if (idx < 0) return ids[0];
  return ids[(idx + delta + ids.length) % ids.length];
}

// Closest neighbor of `leafId` within its enclosing split — prefer the
// next sibling, fall back to the previous. Used to pick the new focus
// when a pane closes (so focus stays in the same neighborhood instead of
// snapping to the first pane in the tree).
export function siblingLeafOf<L extends object>(
  tree: PaneNode<L>,
  leafId: PaneId,
): PaneId | null {
  if (isLeaf(tree)) return null;
  for (let i = 0; i < tree.children.length; i++) {
    const c = tree.children[i];
    if (isLeaf(c) && c.id === leafId) {
      const sibling = tree.children[i + 1] ?? tree.children[i - 1];
      if (!sibling) return null;
      return leafIds(sibling)[0] ?? null;
    }
  }
  for (const c of tree.children) {
    if (!isLeaf(c)) {
      const r = siblingLeafOf(c, leafId);
      if (r !== null) return r;
    }
  }
  return null;
}

export function hasLeaf<L extends object>(
  tree: PaneNode<L>,
  id: PaneId,
): boolean {
  return leafIds(tree).includes(id);
}

// ─── Terminal-specific payload helpers ────────────────────────────────────
// Terminal leaves carry an optional cwd. These thin wrappers keep the many
// existing terminal call sites unchanged.

export type TerminalLeafData = { cwd?: string };
export type TerminalPaneNode = PaneNode<TerminalLeafData>;

export function findLeafCwd(
  n: PaneNode<TerminalLeafData>,
  id: PaneId,
): string | undefined {
  return findLeaf(n, id)?.cwd;
}

export function setLeafCwd(
  n: PaneNode<TerminalLeafData>,
  id: PaneId,
  cwd: string,
): PaneNode<TerminalLeafData> {
  return updateLeaf(n, id, { cwd });
}
