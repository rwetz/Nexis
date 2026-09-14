# Nexis Architecture Redesign Plan

## Mission

Make Nexis architecturally independent from its Terax heritage by establishing explicit Nexis-owned boundaries:

```text
platform -> workbench -> capabilities
                 |
              design system
```

This is an incremental extraction, not a rewrite. Existing behavior, security boundaries, and user-facing workflows must remain intact throughout the migration.

## Hard constraints

- Preserve accurate Terax attribution. Historical ancestry is not technical coupling.
- Do not weaken or delete pitfall tripwires.
- Preserve PTY lifecycle locking, subprocess confinement, workspace authorization, settings event propagation, reasoning pruning, stable Zustand selectors, icon-vendor confinement, and no-emoji rules.
- Every user-facing change gets an `[Unreleased]` entry in `CHANGELOG.md` in the same change.
- Preserve unrelated user changes, including the current modification to `test/scripting/test.py`.
- Do not create compatibility abstractions that only forward calls without owning a real policy or boundary.
- Do not split Nexis back into multiple desktop applications as part of this work.

## Target structure

The exact directory names may change during implementation, but the dependency direction must become enforceable:

```text
src/
  platform/       IPC, workspace, persistence, process, windows, notifications
  workbench/      shell, panels, commands, shortcuts, tabs, layout
  capabilities/   terminal, editor, ai, atlas, benchmark, ml-lab, git, debugger
  design/         theme, icons, motion

src-tauri/src/
  platform/       process, filesystem, workspace, persistence, windows, IPC support
  services/       pty, git, lsp, dap, ai, ml and other long-lived services
  commands/       thin Tauri command adapters
  domain/         shared domain types and policies
```

The current `src/modules` and Rust module layout may remain temporarily. Migration is complete only when dependency rules, not folder names, express the boundary.

## Phase 0: Baseline and inventory

Before moving code:

1. Establish branch, HEAD, and dirty-worktree state.
2. Run the existing frontend tests, Rust tests, formatting, clippy, and production build where available.
3. Inventory every frontend `invoke`, Tauri event, direct store access, vendor icon import, process spawn, filesystem operation, and cross-module import.
4. Classify each item as platform, workbench, capability, or design-system concern.
5. Record current behavior and known exceptions in a short architecture inventory.

Deliverable: `docs/architecture/nexis-boundary-inventory.md`, with no production behavior change.

## Phase 1: Define contracts before moving implementations

Create small, typed interfaces for the seams that currently leak everywhere:

- `PlatformIpc`: typed command invocation and event subscription.
- `WorkspaceContext`: active roots, environment, authorization, and scope identity.
- `ProcessService`: sanctioned non-PTY process creation and lifecycle.
- `PersistenceService`: preferences, session state, and cross-window propagation.
- `PanelContribution`: panel identity, pack, icon name, lifecycle, and activation rules.
- `CommandContribution`: command id, title, keybinding scope, enablement, and handler.
- `CapabilityContext`: workspace, panel, command, notification, and terminal callbacks.

Rules:

- Interfaces own policy, not just function signatures.
- Capability code must not import Tauri internals directly when a platform contract exists.
- Rust Tauri handlers become adapters. Business behavior belongs in platform services or capability services.
- Avoid introducing a dependency-injection framework. Plain constructors and typed objects are sufficient.

Deliverable: contracts compile and have focused unit tests; existing callers may still use legacy paths through temporary adapters.

## Phase 2: Establish the Nexis workbench shell

Extract the application shell from feature implementations:

- panel registry and lazy loading
- command registry
- shortcut scopes
- tab and split ownership
- workspace/layout persistence
- sidebar packs
- activation and focus routing

The shell should know that a capability exists, but not how the capability performs its domain work.

Convert existing panels incrementally, starting with one low-risk panel and then Atlas or Benchmark. Do not migrate Terminal first; Terminal has the highest lifecycle risk.

Acceptance criteria:

- A panel can register itself without editing a central switch statement.
- Commands can be registered by a capability and scoped to its panel.
- Lazy loading remains intact.
- Panel state survives activation/deactivation according to its declared lifecycle.
- No new direct vendor icon imports or ad hoc keyboard handlers appear.

## Phase 3: Extract platform services

Move shared policies behind platform seams, in this order:

1. Workspace context and authorization.
2. Typed IPC bridge and event helpers.
3. Preferences and cross-window synchronization.
4. Process launching.
5. Filesystem operations.
6. Window and notification services.

Each extraction must delete duplicate implementations rather than preserving parallel versions indefinitely.

Special care:

- User-supplied cwd paths must still be authorized before `pty_open`.
- All non-PTY subprocesses must continue through `crate::modules::proc::command()`.
- WSL paths must preserve caller-side Linux paths when invoking WSL commands.
- Settings setters must continue through `writePref()`.
- Host-scoped and workspace-scoped capabilities must remain distinct.

## Phase 4: Migrate capabilities

Migrate capability families in risk order:

1. Atlas and Benchmark, because they are already relatively isolated.
2. Source control and Git history.
3. Editor and explorer.
4. AI tools and agent orchestration.
5. Terminal and PTY renderer lifecycle.
6. LSP, debugger, database, containers, SSH, and other integrations.

For each capability:

- Add a capability entry point and context.
- Replace direct platform access with the relevant contract.
- Move domain state inside the capability.
- Register panels, commands, shortcuts, and status items declaratively.
- Delete obsolete adapters and duplicate helpers.
- Add or update the vault subsystem note.
- Add a detailed CHANGELOG entry if user behavior changes.

Terminal is last because its current invariants are load-bearing. The refactor must not alter ConPTY serialization, shell initialization, PTY write ordering, backpressure handling, or poisoned-lock recovery.

## Phase 5: Enforce the architecture

After migrations stabilize, add automated boundary checks:

- `platform` cannot import capability modules.
- `workbench` cannot import Rust/Tauri implementation details.
- capabilities cannot call raw `invoke` outside the IPC/platform bridge.
- only the design-system icon module may import the icon vendor.
- only sanctioned process helpers may construct subprocesses.
- no capability may create a second preference or workspace implementation.
- command and panel ids must be namespaced and unique.

Use source-tripwire tests where a type-level or lint-level rule is not practical. These guards must fail with actionable messages and must never be weakened to make a migration pass.

## Verification gates for every phase

At each phase boundary:

- TypeScript build passes.
- Frontend tests pass.
- Rust format, tests, and clippy pass.
- Pitfall suites pass unchanged.
- Production build passes.
- Relevant E2E checks pass.
- Dirty-worktree state is reviewed before commit.
- Architecture notes and CHANGELOG are updated in the same commit when applicable.

For Terminal or process changes, additionally verify Windows behavior with a real terminal session, PowerShell startup, cwd changes across drives, tab close/reopen, rapid PTY input, and WSL workspace operations.

## Definition of done

The redesign is complete when:

- New capabilities can be added through contribution contracts rather than central switch statements.
- Feature modules do not directly own platform policy.
- Platform services do not know about individual capabilities.
- IPC, workspace, persistence, process, and window access have one sanctioned path each.
- Atlas, Benchmark, Terminal, AI, Editor, and at least one integration capability use the new contracts.
- Boundary tests prevent the old coupling from returning.
- No duplicate implementation remains solely because migration was inconvenient.
- The vault accurately describes the resulting architecture.

## Astra operating instructions

Work in small, reviewable slices. Before each slice, state the boundary being introduced and the concrete consumers that will migrate. After each slice, report changed files, tests run, remaining legacy paths, and any behavior that could not be proven.

If a proposed move requires weakening a tripwire, changing a security boundary, or preserving two competing implementations, stop and surface the conflict. Do not paper over it.

The first implementation task is Phase 0 only: produce the inventory and baseline report. Do not begin mass file moves until that inventory exists.
