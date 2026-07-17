// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildSwitchOrder,
  mruPromote,
  mruPrune,
  nextSwitchIndex,
} from "./mru";
import type { Tab } from "./tabTypes";

export type TabSwitcherState = {
  /** Tab ids ordered most-recently-used first. */
  order: number[];
  /** Index into `order` currently highlighted. */
  index: number;
};

type HeldMods = { ctrl: boolean; meta: boolean; alt: boolean };

/**
 * MRU (most-recently-used) tab switching with hold-to-cycle semantics.
 *
 * Ctrl+Tab opens an overlay listing tabs by recency (Alt-Tab style); repeated
 * presses while the modifier is held advance the highlight, and releasing the
 * modifier commits the highlighted tab. Escape or window blur cancels. If the
 * user rebinds tab.next to a chord with no modifier (no hold to wait for),
 * it degrades to an instant switch to the most recent other tab.
 */
export function useMruTabSwitcher(opts: {
  tabs: Tab[];
  activeId: number;
  setActiveId: (id: number) => void;
}) {
  const { tabs, activeId, setActiveId } = opts;

  const [switcher, setSwitcher] = useState<TabSwitcherState | null>(null);
  const switcherRef = useRef(switcher);
  useEffect(() => {
    switcherRef.current = switcher;
  }, [switcher]);

  const tabsRef = useRef(tabs);
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  // MRU list, most recent first. Every activation moves the id to the front —
  // including commits from the switcher itself, which is what makes repeated
  // Ctrl+Tab toggle between the two most recent tabs.
  const mruRef = useRef<number[]>([]);
  useEffect(() => {
    mruRef.current = mruPromote(mruRef.current, activeId);
  }, [activeId]);

  // Prune closed tabs; if the switcher is open and its order shrinks below
  // two live entries there is nothing left to pick between — cancel.
  useEffect(() => {
    const aliveIds = tabs.map((t) => t.id);
    const alive = new Set(aliveIds);
    mruRef.current = mruPrune(mruRef.current, aliveIds);
    setSwitcher((s) => {
      if (!s) return s;
      const order = s.order.filter((id) => alive.has(id));
      if (order.length < 2) return null;
      if (order.length === s.order.length) return s;
      return { order, index: Math.min(s.index, order.length - 1) };
    });
  }, [tabs]);

  const heldModsRef = useRef<HeldMods | null>(null);

  const buildOrder = useCallback(
    () =>
      buildSwitchOrder(
        mruRef.current,
        tabsRef.current.map((t) => t.id),
      ),
    [],
  );

  const commit = useCallback(() => {
    const s = switcherRef.current;
    if (s) setActiveId(s.order[s.index]);
    heldModsRef.current = null;
    setSwitcher(null);
  }, [setActiveId]);

  const cancel = useCallback(() => {
    heldModsRef.current = null;
    setSwitcher(null);
  }, []);

  /** Handler for tab.next (+1) / tab.prev (−1). */
  const cycle = useCallback(
    (delta: 1 | -1, e?: KeyboardEvent) => {
      const s = switcherRef.current;
      if (s) {
        setSwitcher({
          ...s,
          index: nextSwitchIndex(s.index, delta, s.order.length),
        });
        return;
      }
      const order = buildOrder();
      if (order.length < 2) return;
      const mods: HeldMods | null = e
        ? { ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey }
        : null;
      if (!mods || (!mods.ctrl && !mods.meta && !mods.alt)) {
        // No modifier held → no release to wait for; instant MRU toggle.
        setActiveId(order[1]);
        return;
      }
      heldModsRef.current = mods;
      setSwitcher({
        order,
        index: delta === 1 ? 1 : order.length - 1,
      });
    },
    [buildOrder, setActiveId],
  );

  /** Mouse pick from the overlay commits immediately. */
  const pick = useCallback(
    (id: number) => {
      setActiveId(id);
      heldModsRef.current = null;
      setSwitcher(null);
    },
    [setActiveId],
  );

  // While open: releasing the held modifier commits; Escape cancels; arrow
  // keys also move the highlight; losing window focus cancels (the release
  // will never arrive, and switching tabs invisibly would surprise).
  useEffect(() => {
    if (!switcher) return;
    const onKeyUp = (e: KeyboardEvent) => {
      const mods = heldModsRef.current;
      if (!mods) return;
      const stillHeld =
        (mods.ctrl && e.ctrlKey) ||
        (mods.meta && e.metaKey) ||
        (mods.alt && e.altKey);
      if (!stillHeld) commit();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        cancel();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        e.stopImmediatePropagation();
        cycle(e.key === "ArrowDown" ? 1 : -1, e);
      }
    };
    window.addEventListener("keyup", onKeyUp, { capture: true });
    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("keyup", onKeyUp, { capture: true });
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("blur", cancel);
    };
  }, [switcher, commit, cancel, cycle]);

  return { switcher, cycle, pick };
}
