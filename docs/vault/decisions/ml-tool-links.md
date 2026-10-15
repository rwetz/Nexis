---
type: decision
description: Synapse, Pulse and Epoch link through tool host actions inside Nexis and a loopback-plus-token channel between apps, not an OS URL scheme.
---

# ML tools link through a loopback channel, not a URL scheme

**Date:** 2026-10
**Status:** active

## Context

The three ML tools are Synapse (ML Lab, id `ml-lab`), Pulse (Benchmark, id
`benchmark`) and Nexis Epoch. They needed to open each other on a specific
project, run, model or dataset. All three are Nexis windows; Epoch's runs
the standalone Epoch app's own UI and backend (github.com/rwetz/nexis-epoch),
pinned by commit (`src/windows/epoch.tsx`, `capabilities/epoch/`), and the
standalone app still exists. Display names live in
`src/lib/toolNames.ts`; ids never change.

## Decision

- **Inside Nexis:** a `{ kind: "tool", tool, params }` host action
  (`window/toolWindowHost.ts`). Any window emits it; the main window calls
  `launchTool`, which adds the workspace root. Tools read parameters with
  `useToolWindowLaunch`: Synapse takes `project` and `run`
  (`ml/links.ts`), Pulse takes `model` (`benchmark/PulseWindow.tsx`), Epoch
  takes `project`, `run` and `dataset` (`windows/epochLinks.ts`; the
  workspace root counts only on the open that creates the window).
- **Between apps** (the standalone Epoch and Nexis): each running app listens on `127.0.0.1:0` and writes
  `{port, token, pid}` to `<data_local_dir>/nexis/links/<app>.json`
  (`nexis`, `epoch`). A sender connects and writes one JSON line
  `{token, url}`. If nothing answers, it launches the app with
  `--link <url>`. A launch carrying a link forwards it and exits before any
  window exists. Code: `src-tauri/src/modules/links.rs` and
  `apps/desktop/src-tauri/src/links.rs` in the Epoch repo. Keep the two
  `links.rs` files in step. Nexis no longer sends links to the standalone
  Epoch: its own Epoch window replaced that (`modules/epoch.rs` removed).

## Alternatives rejected

- `tauri-plugin-deep-link` with `tauri-plugin-single-instance`, as standalone
  Atlas did. Single-instance would end Nexis's one-instance-per-project
  launches (`nexis <folder>`). The scheme also needs a registry write (or a
  dev-time `register_all`). And any web page could fire the links.
- Spawning `nexis <args>` without forwarding: that opens a second Nexis for
  every link.

## Consequences

- Links only select. Rust allows two tools and four parameters (absolute
  paths without `..`, safe run ids). The main window asks before following a
  path outside the open workspace (`window/deepLinks.ts`).
- The token keeps other local users out. Processes run by the same user can
  still send links. That is the same trust level as a URL scheme, with no
  browser entry point.
- When several Nexis instances run, the most recently started one owns
  `nexis.json`. If it has exited, the file is stale: the connect fails, so
  the sender launches a fresh Nexis.
- Nothing is registered with the OS, so a browser or another app can't open
  `nexis://` links. Add a URL scheme only behind a confirmation prompt.
