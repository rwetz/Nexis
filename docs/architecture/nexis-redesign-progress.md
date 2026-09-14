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
