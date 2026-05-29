/**
 * Plugin registry — Zustand store that holds all active contributions.
 *
 * Plugins call `api.registerX()` which writes here. React components read
 * from here to render contributed UI (status bar items, panels, etc.).
 */
import { create } from "zustand";
import type {
  CommandContribution,
  Disposable,
  PanelContribution,
  PluginEvent,
  PluginEventMap,
  StatusBarItem,
} from "./types";

type RegistryState = {
  statusBarItems: StatusBarItem[];
  panels: PanelContribution[];
  commands: Map<string, CommandContribution>;
  // event bus listeners (not stored in Zustand — just a local Map)
};

type RegistryActions = {
  _addStatusBarItem(item: StatusBarItem): void;
  _removeStatusBarItem(id: string): void;
  _addPanel(panel: PanelContribution): void;
  _removePanel(id: string): void;
  _addCommand(cmd: CommandContribution): void;
  _removeCommand(id: string): void;
};

export const usePluginRegistry = create<RegistryState & RegistryActions>(
  (set, get) => ({
    statusBarItems: [],
    panels: [],
    commands: new Map(),

    _addStatusBarItem(item) {
      set((s) => ({
        statusBarItems: [...s.statusBarItems, item].sort(
          (a, b) => b.priority - a.priority,
        ),
      }));
    },
    _removeStatusBarItem(id) {
      set((s) => ({
        statusBarItems: s.statusBarItems.filter((x) => x.id !== id),
      }));
    },

    _addPanel(panel) {
      set((s) => ({ panels: [...s.panels, panel] }));
    },
    _removePanel(id) {
      set((s) => ({ panels: s.panels.filter((x) => x.id !== id) }));
    },

    _addCommand(cmd) {
      const next = new Map(get().commands);
      next.set(cmd.id, cmd);
      set({ commands: next });
    },
    _removeCommand(id) {
      const next = new Map(get().commands);
      next.delete(id);
      set({ commands: next });
    },
  }),
);

// ── Event bus (plain Map, outside Zustand to avoid re-renders) ────────────────

type Listener<K extends PluginEvent> = (data: PluginEventMap[K]) => void;

const listeners = new Map<string, Set<Listener<PluginEvent>>>();

function getListeners<K extends PluginEvent>(event: K): Set<Listener<K>> {
  if (!listeners.has(event)) listeners.set(event, new Set());
  return listeners.get(event) as Set<Listener<K>>;
}

export function emitPluginEvent<K extends PluginEvent>(
  event: K,
  data: PluginEventMap[K],
): void {
  for (const fn of getListeners(event)) {
    try {
      fn(data);
    } catch (err) {
      console.error(`[plugin-bus] error in "${event}" handler`, err);
    }
  }
}

function onPluginEvent<K extends PluginEvent>(
  event: K,
  handler: (data: PluginEventMap[K]) => void,
): Disposable {
  getListeners(event).add(handler as Listener<PluginEvent>);
  return {
    dispose() {
      getListeners(event).delete(handler as Listener<PluginEvent>);
    },
  };
}

// ── Public PluginAPI factory ──────────────────────────────────────────────────

import type { PluginAPI } from "./types";

export function createPluginAPI(): PluginAPI {
  const registry = usePluginRegistry.getState();

  return {
    registerStatusBarItem(item) {
      registry._addStatusBarItem(item);
      return {
        dispose() {
          usePluginRegistry.getState()._removeStatusBarItem(item.id);
        },
      };
    },

    registerPanel(panel) {
      registry._addPanel(panel);
      return {
        dispose() {
          usePluginRegistry.getState()._removePanel(panel.id);
        },
      };
    },

    registerCommand(cmd) {
      registry._addCommand(cmd);
      return {
        dispose() {
          usePluginRegistry.getState()._removeCommand(cmd.id);
        },
      };
    },

    emit: emitPluginEvent,
    on: onPluginEvent,
  };
}
