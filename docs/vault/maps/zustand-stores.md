---
type: map
description: Inventory of all Zustand stores — what state each owns and where it lives.
---

# Zustand stores

All state stores, as of 2026-07 (enumerate fresh with `grep -rn "= create" src --include="*.ts*"`). **Selector rule from CLAUDE.md pitfall #14 applies to every one:** selectors must return stable references — no inline `.filter()`/`.map()`/spread, or you get the infinite `getSnapshot` loop / blank screen. Use `useShallow` for derived selections.

## AI (`src/modules/ai/store/`)

- `useChatStore` (`chatStore.ts`) — the big one: messages, streaming state, `isBusy`, sessions
- `useAgentsStore` — agent personas · `usePlanStore` — plan mode state · `useSnippetsStore` — AI snippets · `useTodosStore` — agent todo list

## Settings

- `usePreferencesStore` (`settings/preferences.ts`) — hydrated prefs; kept live by `onPreferencesChange` (see [[settings-sync]])
- `useSettingsDialogStore` — ephemeral dialog UI state

## Dev tools

- `useDebugStore` (`debugger/debugSession.ts`) + `useBreakpointStore` — DAP session and breakpoints
- `useDiagnosticsStore` (`problems/`) — LSP diagnostics
- `useDatabaseStore` (`database/`) · `useMlStore` (`ml/store.ts`, largest single store file) · `useSshStore` (`ssh/`)

## Workspace & shell

- `useWorkspaceEnvStore` (`workspace/env.ts`) — WSL distros, environment
- `useRecentWorkspaces` · `useRecentFiles` · `useProfilesStore` (shell profiles) · `useAgentQueueStore` (queued agent runs)

## App-wide

- `usePluginRegistry` (`src/lib/plugins/registry.ts`) — plugin contributions incl. `statusBarItems`; the store where pitfall #14 actually bit (`StatusBar.tsx`)
- `useNotificationsStore` · `useCodeSnippetsStore`

Terminal/tabs state is notably **not** here — terminal session state lives in hooks around the PTY bridge ([[terminal-tab-open]]), not a global store.
