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

## Phase 4: capability migration in progress

### Slice 1: Atlas and Benchmark

- Atlas and Benchmark now declare their sidebar panels, commands, titlebar launchers, and focused companion windows from `capabilities/`. App no longer contains Benchmark's panel branch or palette command, and the generic companion shell no longer imports either capability.
- Companion routes are admitted against the current declaration set. Opening remains singleton and keeps the existing `nexis-atlas` / `nexis-benchmark` labels, dimensions, platform chrome, and Atlas title-bar actions.
- Benchmark's six harness calls now use typed host-scoped command descriptors. Its progress/result subscriptions use a module-owned platform event scope, preserving the deliberate run lifetime across panel unmounts. Native file dialogs and Atlas reveal operations cross small platform adapters; Benchmark exports remain on `hostFilesystem` and do not inherit a WSL workspace.
- Focused tests cover declared companion-route admission and prove module-owned Benchmark listeners still update and finish a run without a mounted panel.

Verification for this slice: TypeScript and the production frontend build pass; all 1,198 frontend tests in 83 files pass (coverage statements/lines 90.65%, branches 89.97%, functions 83.51%); `git diff --check` passes. Changed-scope React Doctor reports 16 existing findings from the accumulated branch diff, none in this slice's new capability, window-routing, Benchmark, or platform files. Full Rust and desktop E2E phase gates remain due before Phase 4 is marked complete.

Remaining Phase 4 order: source control/Git history; editor/explorer; AI; terminal; integrations. Raw IPC and central composition in those families remain legacy until their slice lands. Terminal and PTY behavior are untouched by this slice.

### Slice 2: Source Control and Git History

- Source Control now contributes its legacy-compatible panel and palette command from `capabilities/git`. A capability-specific host context supplies the existing summary and tab/workspace callbacks without giving the panel direct access to App or the tab store. The old lazy adapter and App render/command branches are gone; the existing shell-owned rail item remains because it carries the live changed-file badge.
- The Git API now covers worktree list/add/remove through typed workspace-scoped descriptors. Source Control and Git History contain no raw Tauri invoke calls, and Git History opens remote commit pages through the platform opener adapter.
- Git state, remote throttling, contextual repository selection, diff tabs, history tabs, CLI behavior, and the changed-file badge keep their existing owners and behavior. Git History remains a workbench tab surface rather than being misrepresented as a sidebar panel.
- A focused declaration test locks the persisted `source-control` view, unmount lifetime, hidden duplicate rail contribution, and command activation target.

Verification for this slice: TypeScript and the production frontend build pass; all 1,199 frontend tests in 84 files pass (coverage statements/lines 90.65%, branches 89.97%, functions 83.51%); focused capability/workbench/sidebar tests and `git diff --check` pass. Changed-scope React Doctor reports 17 accumulated-branch findings; the only newly listed file is the pre-existing high-complexity `SourceControlPanel` now touched solely to export its prop contract. Remaining Phase 4 order: editor/explorer; AI; terminal; integrations.

### Slice 3: Editor and Explorer

- Explorer now contributes the persisted `explorer` panel and palette command from `capabilities/editor`. Its capability-specific host preserves the stable imperative focus ref and existing file/tab/terminal/preview callbacks without exposing App or tab-store internals. The old App render and command branches are gone; the core shell-owned rail row remains.
- Explorer file search and new-file creation now use `platform/filesystem.ts` with workspace scope. File-manager reveal uses `platform/opener.ts`. Editor formatting uses `platform/processes.ts`, preserving captured local/WSL execution and subprocess policy.
- Editor crash-recovery autosave commands use typed host-scoped descriptors because recovery files live in app data, independent of the active workspace environment.
- Focused tests lock Explorer declaration/lifetime/activation and cover the existing editor/explorer logic. CodeMirror composition, stable extension identity, tab ownership, WSL rename behavior, and zoom exemption are unchanged.

Verification for this slice: TypeScript and the production frontend build pass; all 1,200 frontend tests in 85 files pass with the existing coverage floors; focused editor/explorer/capability/workbench tests and `git diff --check` pass. Changed-scope React Doctor reports 19 accumulated-branch findings, all existing complexity/size or the Phase 2 `PanelHost` lookup warning; the temporary mixed-export warning was removed. Remaining Phase 4 order: AI; terminal; integrations.
