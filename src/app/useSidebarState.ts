// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { isSidebarView, type SidebarView } from "@/modules/sidebar";
import { isBottomView, useBottomPanelStore } from "@/modules/bottom-panel";
import { isAiTool, showAiTool } from "@/modules/ai/store/aiToolStore";
import { isWebTool, requestWebWorkbench } from "@/modules/web-workbench";
import { usePluginRegistry } from "@/lib/plugins/registry";
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

/**
 * Views that were saved by an older build and no longer exist, mapped onto
 * what replaced them. Without this a stored id that has since been removed
 * fails `isSidebarView` and silently falls back to the explorer — which is the
 * right *end state* here, but the remap is what makes that a decision rather
 * than an accident, and it is where the next retirement goes.
 *
 * `getting-started` moved out of the sidebar entirely: onboarding is a
 * full-window takeover now (`OnboardingDialog`).
 */
const RETIRED_VIEWS: Record<string, SidebarView> = {
  "getting-started": "explorer",
};

function readSidebarView(): SidebarView {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_VIEW_STORAGE_KEY);
    if (stored && stored in RETIRED_VIEWS) {
      const replacement = RETIRED_VIEWS[stored];
      window.localStorage.setItem(SIDEBAR_VIEW_STORAGE_KEY, replacement);
      return replacement;
    }
    // A session view saved by a build before the bottom panel existed: it
    // lives there now, so reopen it there and give the sidebar back to Files.
    // Only built-in ids can be judged here — plugins have not registered yet.
    if (stored && (isAiTool(stored) || isWebTool(stored))) {
      window.localStorage.setItem(SIDEBAR_VIEW_STORAGE_KEY, "explorer");
      return "explorer";
    }
    if (stored && isSidebarView(stored) && isBottomView(stored, [])) {
      useBottomPanelStore.getState().show(stored);
      window.localStorage.setItem(SIDEBAR_VIEW_STORAGE_KEY, "explorer");
      return "explorer";
    }
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
    // The one funnel every "open this view" request goes through — palette
    // commands, capability activation, the open-view event, onboarding, the
    // rail. Sessions (build, tests, debugger, …) belong to the bottom panel,
    // so they are routed there and the sidebar keeps what it was showing.
    if (isBottomView(view, usePluginRegistry.getState().panels)) {
      useBottomPanelStore.getState().show(view);
      return;
    }
    // Tools that work through the agent live in the AI window.
    if (isAiTool(view)) {
      showAiTool(view);
      return;
    }
    // Ports, HTTP Client and Web Tools are the Web workbench's tools.
    if (isWebTool(view)) {
      requestWebWorkbench(view);
      return;
    }
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
      const toBottom = isBottomView(detail, usePluginRegistry.getState().panels);
      if (!toBottom && panel && panel.getSize().asPercentage <= 0) {
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
