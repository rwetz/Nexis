// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The bottom panel: where sessions live.
 *
 * A *session* is something you start, watch run, and see finish — a build, a
 * test run, a debugger, a REPL (`kind: "session"` in `sidebar/viewCatalog.ts`).
 * Their output is line-oriented and reads badly in a 280px sidebar, which is
 * why every IDE puts them under the editor. Problems is the first tab: it was
 * a drawer in this slot before the panel existed, and the panel grew out of it.
 *
 * This store is reachable without React because the panel is opened from
 * places that cannot see it: `persistSidebarView` routes every session view
 * here (palette commands, capability activation, the open-view event, the
 * onboarding checklist), and so does the status bar.
 *
 * Open state, the tab and the height persist per viewer, like the sidebar's
 * width. Maximized does not: coming back to a panel that fills the window is
 * disorienting, and it is a one-keystroke state to re-enter.
 */

import { create } from "zustand";

/** A bottom-panel tab: "problems", a built-in session view id, or a
 *  contributed panel's `plugin:<id>` view. */
export type BottomTab = string;

export const PROBLEMS_TAB = "problems";

/** What a session tab's dot says. Idle draws nothing. */
export type SessionStatus = "idle" | "running" | "failed";

/** Versioned in the key: bump the suffix when the stored shape changes, and
 *  an old shape is simply never read rather than half-parsed. */
const STORAGE_KEY = "nexis.bottom-panel:v1";

export const BOTTOM_PANEL_DEFAULT_HEIGHT = 240;
export const BOTTOM_PANEL_MIN_HEIGHT = 96;

type Persisted = { open: boolean; tab: BottomTab; height: number };

function readPersisted(): Persisted {
  const fallback: Persisted = {
    open: false,
    tab: PROBLEMS_TAB,
    height: BOTTOM_PANEL_DEFAULT_HEIGHT,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      open: typeof parsed.open === "boolean" ? parsed.open : fallback.open,
      tab: typeof parsed.tab === "string" && parsed.tab ? parsed.tab : fallback.tab,
      height:
        typeof parsed.height === "number" && Number.isFinite(parsed.height)
          ? Math.max(BOTTOM_PANEL_MIN_HEIGHT, Math.round(parsed.height))
          : fallback.height,
    };
  } catch {
    return fallback;
  }
}

function writePersisted(state: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable: the panel still works, it just forgets.
  }
}

type BottomPanelState = Persisted & {
  maximized: boolean;
  /** Mounted once opened, then kept for the session: closing collapses. */
  everOpened: boolean;
  status: Readonly<Record<BottomTab, SessionStatus>>;
  /** Open the panel on `tab`. */
  show: (tab: BottomTab) => void;
  /** Ctrl+J: open on the last tab, or close. */
  toggle: () => void;
  /** Status-bar semantics: close if already showing `tab`, else show it. */
  toggleTab: (tab: BottomTab) => void;
  close: () => void;
  setTab: (tab: BottomTab) => void;
  setHeight: (height: number) => void;
  toggleMaximized: () => void;
  reportStatus: (tab: BottomTab, status: SessionStatus) => void;
};

export const useBottomPanelStore = create<BottomPanelState>((set, get) => {
  const persist = () => {
    const { open, tab, height } = get();
    writePersisted({ open, tab, height });
  };
  const initial = readPersisted();
  return {
    ...initial,
    everOpened: initial.open,
    maximized: false,
    status: {},
    show: (tab) => {
      set({ open: true, tab, everOpened: true });
      persist();
    },
    toggle: () => {
      set((s) => ({ open: !s.open, everOpened: true, maximized: s.open ? false : s.maximized }));
      persist();
    },
    toggleTab: (tab) => {
      const s = get();
      if (s.open && s.tab === tab) get().close();
      else get().show(tab);
    },
    close: () => {
      set({ open: false, maximized: false });
      persist();
    },
    setTab: (tab) => {
      set({ tab });
      persist();
    },
    setHeight: (height) => {
      if (!Number.isFinite(height) || height < BOTTOM_PANEL_MIN_HEIGHT) return;
      set({ height: Math.round(height) });
      persist();
    },
    toggleMaximized: () => {
      set((s) => ({ maximized: !s.maximized, open: true, everOpened: true }));
      persist();
    },
    reportStatus: (tab, status) => {
      if ((get().status[tab] ?? "idle") === status) return;
      set((s) => ({ status: { ...s.status, [tab]: status } }));
    },
  };
});
