---
type: subsystem
description: Preferences storage and cross-window sync — writePref, onPreferencesChange, and the events that keep windows consistent.
---

# Settings & cross-window sync (`src/modules/settings/`)

Preferences persist via `@tauri-apps/plugin-store` (`LazyStore`, autoSave 200 ms) in `store.ts`. The Settings window is a **separate webview process**, so persistence alone doesn't propagate changes — sync is event-driven.

## The one rule

Every user-facing preference write goes through `writePref(key, value)` (`store.ts`), which does `store.set()` **and** emits `nexis://prefs-changed`. A setter that calls `store.set()`/`store.save()` directly persists fine but silently breaks live sync — invisible in single-window testing (CLAUDE.md pitfall #2; enforced by `pitfall-guards.test.ts`).

## Read/subscribe surface

- `loadPreferences()` — one-shot read of all prefs into a `Preferences` object
- `onPreferencesChange(cb)` — the subscription seam. Dual-source by design: `store.onChange` catches same-process writes immediately; the `nexis://prefs-changed` listener catches cross-window writes. It maps raw store keys → `Preferences` field names via an explicit map — **a new pref key must be added to that map** or cross-window updates for it are dropped silently.
- `preferences.ts:usePreferencesStore` — the Zustand store components read; hydrates via `loadPreferences` and stays current via the subscription. `readBgFastPath()` exists for pre-hydration paint.

## Adding a new preference — checklist

1. `KEY_*` constant + field on `Preferences` + default, in `store.ts`
2. Setter that calls `writePref` (never raw `store.set`)
3. Entry in the `onPreferencesChange` key map
4. Wire into `usePreferencesStore` state

See [[prefs-propagation]] for the end-to-end flow.

## Not in the prefs store

- **API keys** → OS keychain (`secrets_*`, `ai/lib/keyring.ts`); change signal is `nexis://ai-keys-changed` via `emitKeysChanged()`
- Other cross-window signals follow the same pattern: `nexis://custom-themes-changed`, `nexis://code-snippets-changed`, `nexis://ai-agents-changed`, `nexis://ai-snippets-changed`
- `settingsDialogStore.ts` — ephemeral dialog UI state, not persisted

## Related

[[prefs-propagation]] · [[ipc-surface]] · CLAUDE.md pitfall #2
