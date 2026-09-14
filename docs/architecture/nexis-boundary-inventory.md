# Nexis boundary inventory and baseline

Phase 0 of [the redesign plan](nexis-architecture-redesign-plan.md), reviewed **2026-09-14**. This slice inventories existing boundaries; it introduces no production contract, moves no implementation, and changes no application behavior. Phases 1 onward remain open.

## Baseline identity and verification

- Checkout: `codex/atlas-ml-lab-usability`, HEAD `48230cda4ca902d6eda4a491a3856e7fe2d98dd5`.
- Initial worktree: modified `test/scripting/test.py`; untracked `docs/architecture/nexis-architecture-redesign-plan.md`. Both preserved.
- Host: Windows, PowerShell; Node `26.7.0`, pnpm `11.22.0`, Rust `1.97.1`, Cargo `1.97.1`. CI pins Node 22 and pnpm 11.10.0, so these are local results, not a claim about CI.
- No dependency updates, production edits, tripwire edits, commits, or attribution changes. No CHANGELOG entry is needed for this documentation/tooling-only slice.

| Gate | Result |
| --- | --- |
| `pnpm exec tsc --noEmit` | Passed. |
| `pnpm test:coverage` | Passed: 76 files, 1,178 tests, including all 19 frontend pitfall tests. |
| Coverage | Statements/lines 89.36%, branches 89.69%, functions 81.31%; floors 86%, 87%, 76% respectively. Only the explicit coverage include list is measured. |
| `cargo test` in `src-tauri` | Passed: 282 unit tests and 12 integration pitfall tests; no ignored tests. The Windows symlink-escape authorization test passed on this host. |
| `cargo clippy -- -D warnings` in `src-tauri` | Passed. |
| `cargo fmt --check` in `src-tauri`, after clippy | Passed. |
| `pnpm build` | Passed: TypeScript plus Vite production assets, 6,014 transformed modules. |
| `pnpm tauri build --no-bundle` | Passed: optimized Windows `src-tauri/target/release/nexis.exe`. Installer bundling/signing were not exercised. |
| Relevant E2E | Not run for this documentation-only slice. The workflow's path filters likewise exclude these changes. A native build is not evidence of runtime E2E behavior. |

Raw local logs are in `%TEMP%/nexis-phase0-48230cd/`: `typecheck.log`, `frontend-coverage.log`, `rust-test.log`, `rust-clippy.log`, `rust-fmt.log`, `frontend-build.log`, and `desktop-build.log`. The frontend emits Node 26 deprecation/localStorage warnings; they do not fail the suite. Registry statement coverage is only **23.63%** despite the aggregate coverage pass. Add lifecycle/admission tests before changing it.

Unproven here: Linux/macOS builds and tests, cross-window UI behavior, real PowerShell startup and terminal close/reopen, cross-drive cwd inheritance, rapid PTY input, and WSL operations. Production code is unchanged. Run the relevant scenarios when their boundary is migrated. The Windows E2E harness needs the compiled debugging-port overlay and seeds real app preferences; the normal release binary built above is not an E2E binary.

## Reproducible site inventory

[nexis-boundary-inventory.jsonl](nexis-boundary-inventory.jsonl) contains source locations and classifications for each matched site, plus a row for every scanned source file. Regenerate from the repository root:

```powershell
node docs/architecture/scripts/inventory-boundaries.mjs
$sites = Get-Content docs/architecture/nexis-boundary-inventory.jsonl | ConvertFrom-Json
$sites | Where-Object kind -eq 'invoke' | Select-Object file,line,owner,detail
```

The [generator](scripts/inventory-boundaries.mjs) scans 612 frontend source files (533 production, 79 tests/support) and 69 Rust files under `src-tauri/src`, producing **3,959 records plus metadata**. It uses the Babel parser already installed through the Vite React toolchain; it requires installed development dependencies and `rg`. No packages are added.

| Surface | Production frontend sites | Classification / interpretation |
| --- | ---: | --- |
| Raw `invoke` calls | 204 in 42 files, 141 distinct command expressions | Platform transport, currently owned by many capabilities. |
| Tauri imports | 103 | Platform; static, dynamic, and type imports included. |
| Event candidates | 40 | Platform subscription/emission and window lifecycle policy. |
| IPC channels | 3 | Platform transport with capability-owned payloads/lifetimes. |
| Direct persistence accesses | 102 | Platform storage; includes local/session storage, Tauri store access, and Zustand persistence setup. |
| State accesses | 715 | Classified by source owner; ordinary in-memory domain state is not automatically a platform violation. |
| Store imports | 37 | Zustand or Tauri store imports; overlaps the preceding categories. |
| Icon vendor imports | 3 | Design: two Phosphor import declarations in `src/components/icon.tsx`, one Catppuccin asset import in `explorer/lib/iconResolver.ts`. |
| Filesystem IPC calls / bridge consumers | 49 / 41 | Platform; consumers of named `native` filesystem helpers are counted separately from their transport calls. |
| Imports crossing mapped source units | 998 | Workbench, capability, platform, or design according to target; includes type imports, re-exports, and lazy imports. |

Rust evidence contains **145 command attributes**, **100 process candidates**, **422 filesystem/I/O candidates**, **14 event candidates**, and **172 cross-module reference candidates**. The authoritative `generate_handler!` in `src-tauri/src/lib.rs` also registers 145 commands.

The 141 distinct invoke expressions comprise 140 literal command names and one variable, `cmd`, in `explorer/lib/useFileTree.ts:commitCreate`. Manual review resolves that variable to `fs_create_dir` or `fs_create_file`; both are already among the literal names and registered handlers. The 49 filesystem IPC rows count literal calls, with this additional computed filesystem call retained under `invoke`. All 140 literal command names were checked against the handler registry.

**Method limits:** frontend calls/imports are syntax-parsed, not type-resolved. Direct bindings and conventional names are recognized; computed access, arbitrary aliases, transitive helper behavior, and hidden library side effects need review during extraction. Event rows are candidates because a matching method in a Tauri-using file may belong to another emitter. Rust rows are lexical, retain inline tests, and can include strings, same-module references, thread spawns, and pipe/network I/O. They are a review queue, not counts of distinct production OS operations or confirmed violations. `owner` is a provisional path-based allocation; `concern` identifies the intended boundary for the matched operation. Mixed files need splitting, not blind directory moves. The cross-module unit is each `src/modules/<name>`, plugin, shared library area, or app area; same-unit imports are excluded. Generated assets, dependencies, build scripts, and E2E tooling are outside the application-source census. Counts overlap and must not be summed as unique operations.

## Existing boundaries and concrete migration consumers

| Intended owner | Current seam and consumers | Policy the extraction must own |
| --- | --- | --- |
| Platform: workspace | `modules/workspace/env.ts`, `lib/launchDir.ts`, `app/App.tsx`, `tabs/lib/useWorkspaceCwd.ts`; Rust `modules/workspace.rs`. Used by native FS/git, ML/Python probes, tab restore, and PTY opening. | Environment, authorized roots, caller/host path conversion, and scope identity. `workspaceScopeKey` currently distinguishes local vs distro, not individual repository roots. Do not silently reinterpret existing environment-scoped caches as root-scoped. |
| Platform: IPC | `ai/lib/native.ts` (72 invokes), `ml/lib/engine-bridge.ts` (19), `debugger/debugSession.ts` (15), `lsp/client.ts` (13), plus direct component callers. | Command payload/result typing, host/workspace scope, error behavior, and subscription/channel disposal. Do not create an untyped forwarding wrapper. |
| Platform: persistence | `settings/store.ts:writePref`, `onPreferencesChange`; `settings/preferences.ts`; localStorage stores and tab/sidebar persistence. Rust autosave/snapshots/secrets/ledger storage. | Durability, versioning, scope and cross-window propagation. Preference writes already set, save, and broadcast; preserve that one write path. Keep secret material in the keyring and distinguish domain records from preferences. |
| Platform: processes | Rust `proc.rs:command`; shell, git, LSP, DAP, ML/Python, tools, Benchmark. | Hidden Windows subprocess creation, program resolution, workspace routing, cancellation and cleanup. Existing helper owns a real policy and should be extended/extracted, not shadowed by a second constructor. |
| Platform: filesystem | Rust `fs/{file,mutate,tree,search,grep}.rs`, workspace authorization; frontend `ai/lib/native.ts`, editor `useDocument`, explorer `useFileTree`, theme files, export panels. | Canonicalization and authorization, atomic writes, source events, caller-side Linux paths and WSL rename fallback. AI safety/read filtering remains explicit capability policy. |
| Platform: windows/notifications | `modules/window/{openNewWindow,quickTerminal,toolWindow}.ts`, `components/WindowControls.tsx`, `WindowResizeEdges.tsx`, `modules/notifications`. | Window creation/identity and native lifecycle versus workbench presentation and focus routing. `window/ToolWindowShell.tsx` imports Atlas/Benchmark and belongs on the workbench side of the seam. |
| Workbench: panels/packs | `app/App.tsx` sidebar render chain, `sidebar/{types,SidebarRail,PluginPanelSlot,pluginPanels}.ts(x)`, `lib/packs.ts`, `lib/plugins/{types,registry,PluginHost}.ts(x)`. | Registry admission, stable namespaced identity, pack availability, lazy loading, focus and declared activation/unmount behavior. Preserve restored missing-plugin placeholders. |
| Workbench: commands/shortcuts | App command array and handlers, `components/CommandPalette.tsx`, `shortcuts/shortcuts.ts`, `shortcuts/lib/useGlobalShortcuts.ts`, plugin command registry. | One command identity/enablement model with global/panel/input scopes, user overrides and pack gates. Existing plugin commands have only id/title/handler; duplicate ids overwrite the map. |
| Workbench: tabs/layout | `tabs/lib/useTabs.ts`, `tabPersistence.ts`, `useWorkspaceCwd.ts`, `app/useSidebarState.ts`. | Ownership of tabs, splits, saved layouts and activation. Renderer slots and PTY process lifetimes stay terminal-owned until the later terminal slice. |
| Capability: Atlas/Benchmark | `atlas/repos/{api,store,host}.ts(x)` and `benchmark/{store,lib/api}.ts`; Rust `atlas/`, `benchmark/`. | Host-scoped discovery, admitted Atlas repositories and host callbacks; Benchmark job/event lifetime across panel unmounts and managed-engine selection. |
| Capability: AI/editor/git/integrations | `ai/lib/agent.ts`, `ai/tools/`, editor, source-control, git-history, LSP/DAP and other module families. | Domain state and workflows using platform services. The generic plugin API currently imports AI's `ToolContribution`; separate shared contract ownership without moving AI admission policy into the workbench. |
| Design | `components/icon.tsx`, `icon-art.tsx`, `styles/{globals.css,tokens.ts,terminalTheme.ts}`, `modules/theme`, explorer `iconResolver.ts`. | Semantic icons, motion/theme tokens, SVG retint and palette propagation. Theme storage goes through platform; token and icon definitions do not. |

The JSONL source-file rows allocate every scanned module, including those grouped in the table. These allocations are migration candidates, not a declaration that the existing dependency graph already obeys them.

## Findings and exceptions to preserve

1. **AI owns a shared platform bridge today.** There are 36 production importing files outside AI, including App, editor, explorer, source-control, terminal ledger, sysmon and export panels. Move shared FS/git/process types and policy deliberately; `native.readDir` currently forces `showHidden: false` for AI, while other consumers need their own visibility choice. A blind move would spread AI-specific behavior into platform policy.
2. **Two panel/command systems coexist.** Built-ins use 37 sidebar ids plus the App render chain; contributions use `plugin:` view ids and `PanelContribution`. Panels have pack/icon/order metadata, but no lifecycle or activation contract. Registration appends duplicate panel ids and overwrites duplicate command ids. `PluginHost` reactivates enabled plugins when the enabled-pack set changes. Extend the existing contribution boundary and delete central cases as consumers migrate.
3. **Current coupling defeats folder-only enforcement.** `workspace/env.ts` imports settings persistence; `ToolWindowShell` imports capabilities; generic plugin types import AI tool types. Resolve these relationships before introducing strict platform import rules. A guard applied to today's folders would incorrectly bless mixed responsibilities.
4. **Host scope is intentional for Atlas and Benchmark.** Atlas scans configured host repositories with libgit2; source-control uses the user's git CLI, config, hooks and credentials. Benchmark's managed engine is resolved through ML's host helper. Its export dialog returns a host path and calls shared `fs_write_file` without the active WSL environment. Do not automatically stamp every command with `currentWorkspaceEnv()`.
5. **Unmount is not cancellation.** Benchmark's module-scoped progress/result listeners and persisted job id let a run survive panel close. Atlas's host callback context and scoped keymap already provide a useful capability seam. Companion windows add a second lifecycle and theme-sync consumer to both migrations.
6. **PTY and settings already have enforced boundaries.** Preserve their exact guarded call sites until a dedicated migration can update both implementation and justified source locations without weakening invariants. The passing tests establish the starting point, not proof of all real desktop scenarios. Authoritative constraints remain in root `AGENTS.md` and the pitfall suites.

## Next reviewable slices

1. **Phase 1 contracts:** build on `lib/plugins/types.ts` and `registry.ts`. Define uniqueness, enablement, panel lifetime and command scope; test duplicate admission, disposal, pack toggles and missing restored panels. Define workspace/IPC scope contracts around the existing workspace policy, with one host-scoped Atlas API consumer first. Document temporary callers instead of adding a parallel registry or preference store.
2. **Phase 2 first panel:** `webdev/WebToolsPanel.tsx` is a low-risk candidate: local transformations, React state and clipboard use, no raw Tauri imports. Migrate its existing `web-tools` view and `webdev.tools` command with explicit state-reset/preservation behavior, persisted-id compatibility and pack gating. Then migrate Atlas, including its companion window and callbacks; Benchmark follows with job-lifetime tests.
3. **Phase 3 platform extraction:** workspace first, then IPC/events and persistence, processes, filesystem, windows/notifications in the plan's order. Start removing the 36 external AI-bridge dependencies once a platform seam owns the corresponding policy. Each extracted operation must delete its previous implementation.

No consumers have migrated yet. All 204 raw invokes and the existing cross-module paths remain baseline work items. Phase 0 is complete; this report does not claim the redesign is complete.
