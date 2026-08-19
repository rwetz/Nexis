// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { isSidebarView, type SidebarView } from "@/modules/sidebar";
import type { FileExplorerHandle } from "@/modules/explorer";
import type { PanelImperativeHandle } from "react-resizable-panels";

// ─── Constants ────────────────────────────────────────────────────────────────

export const SIDEBAR_DEFAULT_WIDTH = 260;
export const SIDEBAR_MIN_WIDTH = 220;
export const SIDEBAR_MAX_WIDTH = 480;
const SIDEBAR_WIDTH_STORAGE_KEY = "nexis.sidebar.width";
const SIDEBAR_VIEW_STORAGE_KEY = "nexis.sidebar.view";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
}

function readSidebarWidth(): number {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    const parsed = stored ? Number.parseInt(stored, 10) : NaN;
    return Number.isFinite(parsed) ? clampSidebarWidth(parsed) : SIDEBAR_DEFAULT_WIDTH;
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
}

function readSidebarView(): SidebarView {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_VIEW_STORAGE_KEY);
    // Any valid view restores, including pack-owned ones: heavy panels are
    // lazy-loaded, and a view whose pack got disabled in the meantime lands
    // on the PackGatePlaceholder instead of a broken panel.
    if (isSidebarView(stored)) return stored;
  } catch {
    // ignore
  }
  return "explorer";
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Manages sidebar panel width, view selection, collapse state, and the
 * explorer focus-toggle gesture. Accepts `explorerRef` so it can orchestrate
 * focus without coupling App.tsx to the sidebar internals.
 */
export function useSidebarState(explorerRef: RefObject<FileExplorerHandle | null>) {
  const sidebarRef = useRef<PanelImperativeHandle | null>(null);
  // Seeded through a lazy `useState` rather than `useRef(readSidebarWidth())`:
  // a `useRef` argument is evaluated on every render and discarded after the
  // first, so the plain form re-read localStorage on each one. `useState` has
  // the lazy-initialiser form `useRef` lacks, and the ref then takes an
  // already-computed value.
  const [initialSidebarWidth] = useState(readSidebarWidth);
  const sidebarWidthRef = useRef(initialSidebarWidth);
  const sidebarWidthWriteTimerRef = useRef(0);
  const [sidebarView, setSidebarViewState] = useState<SidebarView>(readSidebarView);
  const explorerReturnFocusRef = useRef<HTMLElement | null>(null);

  // Flush the debounced width write on unmount so we don't leak the timer.
  useEffect(() => {
    return () => {
      if (sidebarWidthWriteTimerRef.current) {
        window.clearTimeout(sidebarWidthWriteTimerRef.current);
      }
    };
  }, []);

  const persistSidebarView = useCallback((view: SidebarView) => {
    setSidebarViewState(view);
    try {
      window.localStorage.setItem(SIDEBAR_VIEW_STORAGE_KEY, view);
    } catch {
      // storage may fail in private mode
    }
  }, []);

  // When the active view's expansion pack is disabled (settings toggle in
  // another window, first-run preset), the view id deliberately stays put:
  // App.tsx renders PackGatePlaceholder in the panel slot, offering to
  // enable the pack in place. Re-enabling restores the panel without any
  // view switch; leaving via "Show Files" or the rail moves on normally.

  const toggleSidebar = useCallback(() => {
    const p = sidebarRef.current;
    if (!p) return;
    if (p.getSize().asPercentage <= 0) p.expand();
    else p.collapse();
  }, []);

  // Lets decoupled UI (status-bar pills, plugin commands) open a sidebar
  // view without threading callbacks through App:
  //   window.dispatchEvent(new CustomEvent("nexis:open-sidebar-view", { detail: "ml" }))
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!isSidebarView(detail)) return;
      // Decoupled callers (status pills, plugins, deep links) can't know
      // the pack config — requests for gated views go through and land on
      // the PackGatePlaceholder ("enable X?") rather than being dropped.
      const panel = sidebarRef.current;
      if (panel && panel.getSize().asPercentage <= 0) {
        panel.resize(`${sidebarWidthRef.current}px`);
      }
      persistSidebarView(detail);
    };
    window.addEventListener("nexis:open-sidebar-view", handler);
    return () => window.removeEventListener("nexis:open-sidebar-view", handler);
  }, [persistSidebarView]);

  const cycleSidebarView = useCallback(
    (view: SidebarView) => {
      const panel = sidebarRef.current;
      const collapsed = panel ? panel.getSize().asPercentage <= 0 : false;
      if (collapsed) {
        if (panel) panel.resize(`${sidebarWidthRef.current}px`);
        if (view !== sidebarView) persistSidebarView(view);
        return;
      }
      if (view === sidebarView) {
        panel?.collapse();
        return;
      }
      persistSidebarView(view);
    },
    [persistSidebarView, sidebarView],
  );

  const persistSidebarWidth = useCallback((next: number) => {
    sidebarWidthRef.current = next;
    if (sidebarWidthWriteTimerRef.current) {
      window.clearTimeout(sidebarWidthWriteTimerRef.current);
    }
    sidebarWidthWriteTimerRef.current = window.setTimeout(() => {
      sidebarWidthWriteTimerRef.current = 0;
      try {
        window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
    }, 200);
  }, []);

  /**
   * Toggles focus between the explorer panel and the previously focused
   * element. Opens the sidebar / switches to the explorer view as needed.
   */
  const toggleExplorerFocus = useCallback(() => {
    const explorer = explorerRef.current;
    const panel = sidebarRef.current;
    const collapsed = panel ? panel.getSize().asPercentage <= 0 : false;

    if (sidebarView !== "explorer" || collapsed) {
      if (panel && collapsed) panel.resize(`${sidebarWidthRef.current}px`);
      if (sidebarView !== "explorer") persistSidebarView("explorer");
      const active = document.activeElement;
      explorerReturnFocusRef.current =
        active instanceof HTMLElement && active !== document.body ? active : null;
      requestAnimationFrame(() => explorerRef.current?.focus());
      return;
    }

    if (!explorer) return;

    if (explorer.isFocused()) {
      const target = explorerReturnFocusRef.current;
      explorerReturnFocusRef.current = null;
      if (target && document.body.contains(target)) {
        target.focus();
      } else {
        (document.activeElement as HTMLElement | null)?.blur?.();
      }
      return;
    }

    const active = document.activeElement;
    explorerReturnFocusRef.current =
      active instanceof HTMLElement && active !== document.body ? active : null;
    explorer.focus();
  }, [explorerRef, persistSidebarView, sidebarView]);

  return {
    sidebarRef,
    sidebarWidthRef,
    sidebarView,
    persistSidebarView,
    toggleSidebar,
    cycleSidebarView,
    persistSidebarWidth,
    toggleExplorerFocus,
  };
}
