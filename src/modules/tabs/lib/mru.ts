// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Pure MRU-order helpers behind useMruTabSwitcher — kept free of React so the
 * ordering rules are unit-testable in the node test environment.
 */

/** Move `id` to the front of the MRU list (most recent first). */
export function mruPromote(mru: number[], id: number): number[] {
  return [id, ...mru.filter((x) => x !== id)];
}

/** Drop MRU entries whose tab no longer exists. */
export function mruPrune(mru: number[], aliveIds: number[]): number[] {
  const alive = new Set(aliveIds);
  return mru.filter((id) => alive.has(id));
}

/**
 * The order the switcher displays: MRU entries first (deduped, dead ids
 * dropped), then any live tabs never activated this session in tab-bar order,
 * so every tab stays reachable.
 */
export function buildSwitchOrder(mru: number[], aliveIds: number[]): number[] {
  const seen = new Set<number>();
  const order: number[] = [];
  for (const id of mru) {
    if (aliveIds.includes(id) && !seen.has(id)) {
      order.push(id);
      seen.add(id);
    }
  }
  for (const id of aliveIds) if (!seen.has(id)) order.push(id);
  return order;
}

/** Advance the highlight with wraparound. */
export function nextSwitchIndex(
  index: number,
  delta: 1 | -1,
  len: number,
): number {
  return (index + delta + len) % len;
}
