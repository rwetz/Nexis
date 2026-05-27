import { create } from "zustand";

export type NotificationType = "info" | "success" | "warning" | "error";

export type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  at: number;
  read: boolean;
};

type State = {
  items: Notification[];
  unreadCount: number;
  add: (type: NotificationType, title: string, message?: string) => void;
  markAllRead: () => void;
  clear: () => void;
  remove: (id: string) => void;
};

let _seq = 0;

export const useNotificationsStore = create<State>((set) => ({
  items: [],
  unreadCount: 0,
  add: (type, title, message) => {
    const n: Notification = {
      id: `n-${Date.now()}-${++_seq}`,
      type,
      title,
      message,
      at: Date.now(),
      read: false,
    };
    set((s) => ({
      items: [n, ...s.items].slice(0, 200),
      unreadCount: s.unreadCount + 1,
    }));
  },
  markAllRead: () =>
    set((s) => ({
      items: s.items.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),
  clear: () => set({ items: [], unreadCount: 0 }),
  remove: (id) =>
    set((s) => {
      const removed = s.items.find((n) => n.id === id);
      return {
        items: s.items.filter((n) => n.id !== id),
        unreadCount: removed && !removed.read
          ? Math.max(0, s.unreadCount - 1)
          : s.unreadCount,
      };
    }),
}));

export function notify(type: NotificationType, title: string, message?: string) {
  useNotificationsStore.getState().add(type, title, message);
}
