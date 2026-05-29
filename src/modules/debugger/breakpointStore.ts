import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Breakpoint = {
  id: string;
  path: string;
  /** 1-based line number (matches editor display). */
  line: number;
  enabled: boolean;
  condition?: string;
  verified?: boolean;
};

type BreakpointStore = {
  breakpoints: Breakpoint[];
  addBreakpoint: (path: string, line: number) => string;
  removeBreakpoint: (id: string) => void;
  toggleBreakpoint: (path: string, line: number) => void;
  setVerified: (path: string, line: number, verified: boolean) => void;
  clearForPath: (path: string) => void;
  clearAll: () => void;
  breakpointsForPath: (path: string) => Breakpoint[];
  /** Return a Map<path, line[]> for passing to dap_start. */
  asMap: () => Map<string, number[]>;
};

export const useBreakpointStore = create<BreakpointStore>()(
  persist(
    (set, get) => ({
      breakpoints: [],

      addBreakpoint(path, line) {
        const id = `${path}:${line}:${Date.now()}`;
        set((s) => ({
          breakpoints: [
            ...s.breakpoints.filter((b) => !(b.path === path && b.line === line)),
            { id, path, line, enabled: true },
          ],
        }));
        return id;
      },

      removeBreakpoint(id) {
        set((s) => ({ breakpoints: s.breakpoints.filter((b) => b.id !== id) }));
      },

      toggleBreakpoint(path, line) {
        const existing = get().breakpoints.find(
          (b) => b.path === path && b.line === line,
        );
        if (existing) {
          get().removeBreakpoint(existing.id);
        } else {
          get().addBreakpoint(path, line);
        }
      },

      setVerified(path, line, verified) {
        set((s) => ({
          breakpoints: s.breakpoints.map((b) =>
            b.path === path && b.line === line ? { ...b, verified } : b,
          ),
        }));
      },

      clearForPath(path) {
        set((s) => ({ breakpoints: s.breakpoints.filter((b) => b.path !== path) }));
      },

      clearAll() {
        set({ breakpoints: [] });
      },

      breakpointsForPath(path) {
        return get().breakpoints.filter((b) => b.path === path && b.enabled);
      },

      asMap() {
        const map = new Map<string, number[]>();
        for (const bp of get().breakpoints.filter((b) => b.enabled)) {
          const arr = map.get(bp.path) ?? [];
          arr.push(bp.line);
          map.set(bp.path, arr);
        }
        return map;
      },
    }),
    { name: "nexis-breakpoints" },
  ),
);
