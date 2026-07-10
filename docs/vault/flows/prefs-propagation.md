---
type: flow
description: End-to-end sequence when a preference changes in the Settings window and the main window updates live.
---

# Flow: a preference changes

Why this is a flow at all: the Settings window is a separate Tauri webview process, so a change there must cross a process boundary to reach the main window (CLAUDE.md pitfall #2).

1. **User toggles a setting** in the Settings window UI (`src/settings/sections/*`).
2. **Setter fires** — e.g. `setTheme(value)` in `settings/store.ts` — which calls `writePref(key, value)`.
3. **`writePref` does two things:** persists via `LazyStore.set` (autoSave 200 ms debounce), and `emit("nexis://prefs-changed", { key, value })`.
4. **Same process:** `LazyStore.onChange` fires immediately for local listeners.
5. **Other windows:** the `nexis://prefs-changed` Tauri event is the only signal (`LazyStore.onChange` never fires cross-process). `onPreferencesChange` listens to **both** sources and translates the raw store key to a `Preferences` field via its key map — an unmapped key is dropped silently.
6. **React updates:** `usePreferencesStore` (`settings/preferences.ts`) receives the callback, sets state, subscribed components re-render.

**Failure modes:** setter bypasses `writePref` → persists but no live sync (invisible in single-window testing); key missing from the `onPreferencesChange` map → same symptom, different cause. Check both before digging deeper.

## Related

[[settings-sync]] · [[ipc-surface]] (events section)
