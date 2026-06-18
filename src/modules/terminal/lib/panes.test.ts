// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import { leafIds, movePane, type PaneNode } from "./panes";

// Structural ops are payload-agnostic; use a minimal optional payload so the
// leaf factory needs no extra fields.
type L = { cwd?: string };
const leaf = (id: number): PaneNode<L> => ({ kind: "leaf", id });

describe("movePane", () => {
  it("swaps a leaf with its next/prev sibling in a matching-axis split", () => {
    const tree: PaneNode<L> = {
      kind: "split",
      id: 100,
      dir: "row",
      children: [leaf(1), leaf(2), leaf(3)],
    };
    // Move leaf 1 right → [2, 1, 3]
    const right = movePane(tree, 1, "row", 1);
    expect(leafIds(right)).toEqual([2, 1, 3]);
    // Move leaf 3 left → [1, 3, 2]
    const left = movePane(tree, 3, "row", -1);
    expect(leafIds(left)).toEqual([1, 3, 2]);
  });

  it("is a no-op when the parent split orientation differs from the axis", () => {
    const tree: PaneNode<L> = {
      kind: "split",
      id: 100,
      dir: "row",
      children: [leaf(1), leaf(2)],
    };
    // Vertical move in a horizontal split → unchanged (same reference).
    expect(movePane(tree, 1, "col", 1)).toBe(tree);
  });

  it("is a no-op at the edges of its split", () => {
    const tree: PaneNode<L> = {
      kind: "split",
      id: 100,
      dir: "col",
      children: [leaf(1), leaf(2)],
    };
    expect(movePane(tree, 1, "col", -1)).toBe(tree); // already first
    expect(movePane(tree, 2, "col", 1)).toBe(tree); // already last
  });

  it("reorders within the leaf's immediate parent in a nested tree", () => {
    // row[ leaf(1), col[ leaf(2), leaf(3) ] ]
    const tree: PaneNode<L> = {
      kind: "split",
      id: 100,
      dir: "row",
      children: [
        leaf(1),
        { kind: "split", id: 200, dir: "col", children: [leaf(2), leaf(3)] },
      ],
    };
    // Move leaf 2 down inside the inner col split.
    const moved = movePane(tree, 2, "col", 1);
    expect(leafIds(moved)).toEqual([1, 3, 2]);
    // Outer split is untouched structurally; only the inner branch changed.
    expect(moved).not.toBe(tree);
    if (moved.kind === "split") expect(moved.children[0]).toBe(tree.children[0]);
  });

  it("never drops or duplicates leaves", () => {
    const tree: PaneNode<L> = {
      kind: "split",
      id: 100,
      dir: "row",
      children: [leaf(1), leaf(2), leaf(3), leaf(4)],
    };
    const moved = movePane(tree, 2, "row", 1);
    expect([...leafIds(moved)].sort()).toEqual([1, 2, 3, 4]);
  });

  it("returns a leaf tree unchanged", () => {
    const tree = leaf(1);
    expect(movePane(tree, 1, "row", 1)).toBe(tree);
  });
});
