---
type: subsystem
description: Debug Adapter Protocol integration, including adapter sessions, typed native calls, events, and debugger state.
---

# Debugger integration

`src/modules/debugger/debugSession.ts` owns the active DAP session and debugger state. It sequences breakpoint setup before launch and configuration completion, then owns stepping, stack frames, scopes, variables, evaluation, output, and teardown.

## Boundaries

- `src/capabilities/debugger/api.ts` owns typed `dap_start`, `dap_request`, and `dap_stop` calls.
- `src/capabilities/debugger/index.tsx` owns the saved `debugger` sidebar route and composes its lazy toolbar/panel through the workbench contribution lifecycle.
- `src/modules/debugger/debugSession.ts` owns domain lifecycle and listens through `platform/events.ts` for stopped, continued, output, terminated, and thread events.
- `src-tauri/src/modules/dap/` owns adapter subprocesses and DAP framing. Adapter subprocess construction must stay on the sanctioned Rust process helper.

## Scope limitation

The Rust `dap_start` contract accepts an adapter command, arguments, and ID, but no `WorkspaceEnv`. The frontend therefore declares the protocol host-scoped. WSL-native adapter execution requires an explicit backend contract and desktop E2E proof.

## Lifetime traps

- Event listeners belong to the session and must be released on `stop` and `reset`.
- Breakpoints are sent before `launch`, followed by `configurationDone`; changing that order can lose initial stops.
- A terminated event updates state but does not replace explicit adapter cleanup.
- Variable children are cached by `variablesReference`; starting or selecting a new frame clears the appropriate cache.

## Related

[[platform]] · [[ipc-surface]] · [[lsp]]
