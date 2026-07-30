// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { useEffect, useRef } from "react";
import { packEnabled } from "@/lib/packs";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  SHORTCUTS,
  matchBinding,
  type ShortcutId,
} from "../shortcuts";

export type ShortcutHandler = (e: KeyboardEvent) => void;
export type ShortcutHandlers = Partial<Record<ShortcutId, ShortcutHandler>>;

export type UseGlobalShortcutsOptions = {
  isDisabled?: (id: ShortcutId, e: KeyboardEvent) => boolean;
};

export function useGlobalShortcuts(
  handlers: ShortcutHandlers,
  options?: UseGlobalShortcutsOptions,
) {
  // Latest handlers for the document-level key listener, which is registered
  // once. Written after commit so a discarded render can't install handlers
  // belonging to UI that never appeared.
  // No dep array on purpose: callers pass `handlers`/`options` as inline
  // object literals, so they are new every render and mirroring after every
  // commit is exactly the intent.
  const latest = useRef({ handlers, options });
  useEffect(() => {
    latest.current = { handlers, options };
  });

  // Access the shortcuts from the store
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  const enabledPacks = usePreferencesStore((s) => s.enabledPacks);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { handlers, options } = latest.current;
      for (const s of SHORTCUTS) {
        // A shortcut owned by a disabled expansion pack behaves as unbound.
        if (!packEnabled(s.pack, enabledPacks)) continue;
        if (e.repeat && !s.allowRepeat) continue;
        const bindings = userShortcuts[s.id] || s.defaultBindings;
        const isMatch = bindings.some((b) => matchBinding(e, b, s.id));
        if (!isMatch) continue;
        if (options?.isDisabled?.(s.id, e)) return;
        const h = handlers[s.id];
        if (!h) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        h(e);
        return;
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true });
  }, [userShortcuts, enabledPacks]);
}
