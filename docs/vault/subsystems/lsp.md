---
type: subsystem
description: Language-server integration — sessions, typed native protocol, diagnostics and server-initiated edits.
---

# LSP integration

`src/modules/lsp/client.ts` owns one session per language-server group and workspace root. Concurrent starts share one promise; document versions and diagnostic subscribers live with the session and are released when it stops.

## Boundaries

- `src/capabilities/lsp/api.ts` owns typed `lsp_start`, `lsp_request`, `lsp_notify`, and `lsp_stop` calls.
- `src/modules/lsp/client.ts` owns domain lifecycle and listens through `platform/events.ts` for diagnostics and `workspace/applyEdit`.
- `src/modules/lsp/applyEdit.ts` applies server edits through the shared workspace filesystem behavior so open tabs receive the normal file-written signal.
- `src-tauri/src/modules/lsp/` owns the subprocess and JSON-RPC transport; subprocess construction must stay on the sanctioned Rust process helper.

## Scope limitation

The Rust `lsp_start` command accepts a host `workspace_root` string but no `WorkspaceEnv`. The frontend therefore declares the current protocol host-scoped. Do not label it WSL-aware merely because an active editor path may be POSIX-shaped; a WSL-native server requires an explicit backend contract and desktop E2E proof.

## Lifetime traps

- Keep `starting` rejection/finish cleanup so one failed server start does not permanently block retries.
- Diagnostics are filtered by workspace root before reaching session listeners.
- `workspace/applyEdit` is one global listener because servers can initiate edits after an execute-command request.
- Missing language servers are expected degradation and must continue through `reportMissingTool`, not disappear silently.

## Related

[[editor]] · [[platform]] · [[ipc-surface]]
