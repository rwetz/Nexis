// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { viewEnabled } from "@/lib/packs";
import { isSidebarViewId, type SidebarViewId } from "@/modules/sidebar";
import type { FileExplorerHandle } from "@/modules/explorer";
import { usePreferencesStore } from "@/modules/settings/preferences";
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

function readSidebarView(): SidebarViewId {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_VIEW_STORAGE_KEY);
    if (stored === "explorer" || stored === "source-control") return stored;
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
  const sidebarWidthRef = useRef(readSidebarWidth());
  const sidebarWidthWriteTimerRef = useRef(0);
  const [sidebarView, setSidebarViewState] = useState<SidebarViewId>(readSidebarView);
  const explorerReturnFocusRef = useRef<HTMLElement | null>(null);

  // Flush the debounced width write on unmount so we don't leak the timer.
  useEffect(() => {
    return () => {
      if (sidebarWidthWriteTimerRef.current) {
        window.clearTimeout(sidebarWidthWriteTimerRef.current);
      }
    };
  }, []);

  const persistSidebarView = useCallback((view: SidebarViewId) => {
    setSidebarViewState(view);
    try {
      window.localStorage.setItem(SIDEBAR_VIEW_STORAGE_KEY, view);
    } catch {
      // storage may fail in private mode
    }
  }, []);

  // If the active view's expansion pack is disabled (settings toggle in
  // another window, first-run preset), fall back to the explorer rather
  // than leaving a panel visible that the rail no longer offers.
  const enabledPacks = usePreferencesStore((s) => s.enabledPacks);
  useEffect(() => {
    if (!viewEnabled(sidebarView, enabledPacks)) {
      persistSidebarView("explorer");
    }
  }, [enabledPacks, sidebarView, persistSidebarView]);

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
      if (!isSidebarViewId(detail)) return;
      // Decoupled callers (status pills, plugins) can't know the pack
      // config — drop requests for views whose pack is disabled.
      const packs = usePreferencesStore.getState().enabledPacks;
      if (!viewEnabled(detail, packs)) return;
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
    (view: SidebarViewId) => {
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
