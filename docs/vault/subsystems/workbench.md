---
type: subsystem
description: Workbench contribution registration, panel lifetime, command routing and shell state ownership.
---

# Workbench

`workbench/CapabilityHost.tsx` activates declarative capability definitions against the existing plugin registry, transactionally disposes registration on failure/unmount, and supplies current host callbacks. `capabilities/index.ts` is the composition list. A new contributed panel needs no App render branch.

`workbench/PanelHost.tsx` owns lazy render boundaries, pack/enablement checks, activation focus and declared `unmount`/`retain` lifetime. Retained panels are hidden and inert. Disabling a pack or removing the registration releases them. It intentionally preserves React identity of legacy fallback content. Built-in saved view IDs remain supported through `legacyView`; new contributions use `plugin:<namespaced-id>`.

`workbench/commands.ts` executes registered commands against current pack and scope state. The existing `useGlobalShortcuts` router dispatches contributions after built-in bindings. Panel scope is determined from the focused element's nearest `data-panel-id`; inputs, CodeMirror and xterm do not consume bare panel keys. The palette admits scoped commands for the selected panel. Built-in binding precedence is unchanged.

`app/useCapabilities.ts` wires workspace, terminal/editor operations, panel activation and palette rows into the host context. Capabilities receive operations rather than tab-store access. `modules/tabs/lib/useTabs.ts`, tab persistence and terminal pane-tree utilities remain the single tab/split owners; `app/useSidebarState.ts` remains the sidebar width/view persistence owner. These established implementations have not been duplicated.

Web Tools, HTTP Client, Atlas, Benchmark, Source Control, Explorer, Debugger, Database, Ports, SSH, Share, and ML Lab are declarative panels. Atlas and Benchmark also declare their focused companion windows, so the titlebar and window shell consume capability metadata instead of maintaining parallel tool lists. Existing built-in rail rows keep their saved IDs, pack placement, badges, and ordering while capability code owns rendering and activation. `capabilities/integration-context.tsx` is the narrow composition seam for preview-tab, SSH-terminal, and ML-network actions; it does not expose App or tab-store state. Benchmark and Share keep their module-owned service/event lifetimes across panel unmounts.

Tests: `workbench/hosts.test.tsx` covers retained/unmounted state, focus, disabled-pack teardown, StrictMode registration cleanup, latest host callbacks and input isolation. `e2e/specs/workbench.test.ts` exercises real lazy panels, saved-view restoration and command admission.

Related: [[architecture-boundaries]], [[atlas]], [[benchmark]], [[web-dev-pack]], [[settings-sync]].
