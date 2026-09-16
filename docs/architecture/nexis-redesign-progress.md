# Architecture redesign progress

The [plan](nexis-architecture-redesign-plan.md) and [Phase 0 baseline](nexis-boundary-inventory.md) define scope and verification. Each completed phase is committed separately. The pre-existing change to `test/scripting/test.py` is excluded throughout.

## Phase 0: complete

Commit `8017068`. Inventory, baseline builds/tests and vault corrections. See the baseline report for exact commands and runtime limitations.

## Phase 1: contracts complete

- `platform/ipc.ts` owns command scope injection and subscription lifetimes; `platform/tauri.ts` owns the native transport. Atlas's four scanner calls now use typed host-only descriptors.
- `platform/workspace.ts` distinguishes environment and root-set identities; the existing workspace store consumes its environment type/identity without introducing another store.
- `platform/persistence.ts` serializes durable writes including their notifications and recovers the queue after rejection. Existing preference writes remain in their guarded implementation until extraction.
- `platform/process.ts` defines non-PTY session ownership, preauthorization, captured environment and idempotent cancellation. The native constructor remains `modules/proc.rs:command`.
- `workbench/contributions.ts` and the existing plugin types declare namespaced admission, panel lifetime, command scope and enablement. The existing registry rejects duplicate panel/command IDs and makes disposal ownership-safe.
- `workbench/capability.ts` defines the workspace, IPC, contributions, notification, terminal and editor callback boundary.
- Focused tests exercise scope, late subscriptions, disposal failures, persistence ordering/recovery, process authorization/environment capture and contribution admission/scope.

Remaining legacy paths: all non-Atlas IPC call sites, direct storage/window APIs, built-in panel render branches and commands. Process/persistence adapters will adopt the contracts in Phase 3. Panel lifecycle and scoped execution become live in Phase 2. No PTY lifecycle or Rust implementation changes in this phase.

Verification: TypeScript, frontend coverage (1,189 tests in 79 files; statements/lines 90.42%, branches 89.86%, functions 82.44%), all 294 Rust tests, clippy, rustfmt, and Windows release build passed. React Doctor stayed at 89, with only the pre-existing ML panel complexity warning. Both existing E2E specs passed (six tests) against the isolated E2E release build using Node 22.23.2 and WebView2/driver 152.0.4191.66. Node 26 fails before session creation with `UND_ERR_INVALID_ARG`; use the CI runtime for this harness. Local evidence is `%TEMP%/nexis-phase1-*.log`, with the successful E2E run in `nexis-phase1-e2e-node22-verified.log`.

The E2E overlay/harness now use `app.nexis.nexis.e2e` so repeated phase verification does not overwrite real preferences. This isolation is separately tested. No real WSL or cross-drive terminal scenarios are claimed at this stage; the terminal implementation is unchanged.

## Phase 2: workbench complete

- `CapabilityHost` registers declarations transactionally, supplies current callbacks and disposes contributions correctly under StrictMode.
- `PanelHost` owns lazy rendering, activation focus, pack/enablement admission and declared retain/unmount lifetime. Inactive retained panels are hidden and inert; disabling a pack releases their state. Legacy fallback component identity is preserved.
- Web Tools and embedded Atlas now register panels and commands through `capabilities/` without App render branches. Old saved view/pin IDs remain valid. Atlas scanner state stays inside Atlas.
- The existing shortcut router dispatches contributed bindings with focused-panel/input scope. The palette consumes registered commands, applying pack and panel checks. Existing built-in binding precedence is preserved.
- `app/useCapabilities.ts` supplies terminal/editor/workspace operations without giving capabilities access to the tab store. Existing `useTabs`, pane-tree utilities, tab persistence, `useSidebarState`, pack definitions and the plugin registry remain their sole owners; no competing implementations were added.
- The HTTP-share denial test now consumes the declared response length and asserts the exact denial body, after repeated Windows resets on EOF. Production HTTP behavior and the pitfall suites are unchanged.

Verification: TypeScript, 1,193 frontend tests in 80 files (coverage statements/lines 90.66%, branches 89.97%, functions 83.51%), all 294 Rust tests, clippy, rustfmt and Windows production build pass. React Doctor remains 89; it reports existing large App/ML function complexity in the changed-file scope. All eight desktop E2E tests in three specs passed, including lazy Web Tools restoration after reload and Atlas command scope. Evidence: `%TEMP%/nexis-phase2-*.log`.

Remaining legacy paths: other built-in panel branches/commands and companion-window composition, raw non-Atlas IPC, direct store/window APIs, shared AI-native utility imports. These are Phase 3/4 work. Terminal implementation and actual PTY behavior remain unchanged in this phase.

## Phase 3: platform services complete

- `platform/` now owns typed host/workspace IPC, event lifetimes, the workspace store and captured authorization, storage queues, shared filesystem/process access, named-window creation, notifications, command-ledger persistence and system-resource sampling.
- The old `modules/workspace/{env,identity,index}.ts` implementation moved into the platform boundary. Remembering the last WSL distro now happens at the composition root, so workspace policy no longer imports the preference schema.
- The cross-domain `ai/lib/native.ts` bridge was deleted. Shared native result types live in `domain/native-types.ts`; filesystem, process, git, ledger and system-monitor consumers use their owning seams. AI-only canonical-read policy remains in `ai/lib/filesystem.ts`.
- Preference writes serialize the entire set/save/broadcast transaction and recover after rejection. Agent shell sessions capture one environment across authorization/open/run, serialize commands, close idempotently and still evict failed opens for retry.
- The E2E-only desktop bridge is excluded from shipping builds. Its platform spec verifies PowerShell output and complete burst ordering, repeated close/reopen on `C:` and `G:`, non-PTY cwd capture, and WSL write/replace/rename/read plus cwd execution using Linux paths.

Verification: TypeScript, 1,196 frontend tests, all 294 Rust tests, clippy, rustfmt and Windows production/E2E release builds pass. React Doctor's full result is unchanged from Phase 2 at 180 existing warnings across 92 files. All ten desktop E2E tests in four specs pass under Node 22.23.2, including the real platform adapter checks. Evidence: `%TEMP%/nexis-phase3-*.log`.

Remaining legacy paths: capability-local raw IPC and Tauri plugin calls, remaining central built-in panel/command branches, and companion-window composition. These move with their capability owners in Phase 4. PTY implementation, Rust process construction, workspace authorization and settings propagation guards remain unchanged.
