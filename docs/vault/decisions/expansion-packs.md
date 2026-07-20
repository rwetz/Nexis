---
type: decision
description: Feature surface is split into a fixed core plus toggleable "expansion packs"; packs enable/disable shipped code, they don't install it (except nexis-ml)
---

# Feature surface splits into core + expansion packs

**Date:** 2026-07
**Status:** active — V1 implemented 2026-07; V2 gating (palette/keybindings/settings rows) + V4 "enable pack?" placeholder implemented 2026-07; V2 registry-panel mechanism implemented 2026-07-19; remaining phases tracked in ROADMAP.md ("Up next")

## Context

The sidebar rail exposes ~24 panels. The average CS-focused user needs a fraction of them; the full surface costs discoverability and makes the product read as unfocused. We want a Bare-Bones install (editor, terminal, Files, Recent Files, Source Control, AI chat) with everything else opt-in — configurable at first run and any time later in Settings.

## Decision

1. **Packs are enablement gating, not installation.** Tauri ships all JS in the binary and heavy panels are already lazy-loaded, so a disabled pack costs ~nothing at runtime and *zero bytes* are saved by disabling it. UI language says "enable", never "install". The one exception is **nexis-ml**: a genuine on-demand download, owned by the ML Lab pack — consent prompt, pinned SHA-256 verification, offline local-copy path, and uninstall implemented; see [[nexis-ml-artifact-pinning]].
2. **AI chat via API is core; ML Lab is a pack.** The boundary is *"talks to an API you configured"* (core — BYOK, inert without keys) vs *"manages local runtimes and models"* (pack). The agent/chat surface is the product's identity and is not removable.
3. **Core (never gated):** terminal, editor, `explorer`, `recent-files`, `source-control`, `agent-queue`, AI chat/agent.
4. **Pack taxonomy (pack → sidebar view ids):**
   - `navigation-plus` — outline, bookmarks
   - `code-tools` — build, tests, debugger, symbol-search, code-review
   - `ai-extras` — refactor, prompt-templates
   - `dev-tools` — processes, ports, repl, database, profiles, ssh
   - `ml-lab` — ml (owns the future nexis-ml download flow)
   - `advanced` — share, notes, shell-snippets, snippets, release
5. **Config:** `enabledPacks: PackId[]` in the preferences store, routed through `writePref()` (cross-window sync — CLAUDE.md pitfall #2). **Default = all packs on** so existing users see no change on upgrade. A `packsOnboarded` marker pref gates the one-time first-run preset picker (Bare-Bones / Standard / Everything — presets are just bundles of toggles over the same config).
6. **Gating points:** `SidebarRail` filters its item list; App.tsx renders `PackGatePlaceholder` ("This panel is part of the X pack — Enable?") in the panel slot when the active view's pack is disabled — the view id stays put, so enabling restores the panel in place; `PluginHost` skips plugins whose pack is off (mlPlugin → `ml-lab`). Pinned-rail entries of disabled packs are filtered at render but kept in storage so re-enabling restores them; the same survive-in-storage rule applies to keybinding customizations of gated shortcuts.
7. **Non-view surfaces gate through `packEnabled()`** (`src/lib/packs.ts`): `Shortcut.pack` and `CommandDef.pack` declare ownership; a disabled pack's palette entries disappear, its keybindings go inert in `useGlobalShortcuts` (behave as unbound), and its rows hide from the shortcuts dialog + Settings → Shortcuts. Tests in `shortcuts.test.ts` pin each tagged shortcut to `packForView()` of the view it opens. Any new gated surface (e.g. V3 install-flow settings) should use the same predicate.
8. **Decoupled view-open requests are not dropped:** `nexis:open-sidebar-view` for a gated view goes through and lands on the placeholder — deep links and stale callers degrade to an enable offer, not a no-op. Likewise `readSidebarView` now restores any valid view id across restarts (was: only explorer/source-control); a restored-but-gated view lands on the placeholder.

## Alternatives rejected

- **Real package/download system** — versioning, update channel, and marketplace-grade supply-chain surface for zero user benefit given the code already ships; also collides with the "no extension marketplace" hard limit.
- **Simple-vs-advanced variants of each feature** — doubles the maintained UI surface per feature forever; cut from V1, revisit as per-pack settings if demand shows.
- **Separate config file (nexis.toml)** — the prefs store already exists, syncs across windows, and has one loading path; a second config surface invites drift.

## Consequences

- Adding a sidebar panel now requires assigning it a pack (or explicitly core) — keep the taxonomy in one module (`src/lib/packs.ts`) so this is a one-line decision.
- Session restore / deep links referencing a disabled pack's view must degrade gracefully (fallback view; later: "enable X?" placeholder).
- Pack dependencies are deliberately not modeled (`requires:` was considered) — packs are designed to be independent; keep it that way.
- Long tail: migrating panels into the plugin registry (`src/lib/plugins/registry.ts`) one at a time makes commands/status-bar items gate through the same mechanism instead of per-site `if`s. V1 gated only the rail + panel switch + plugin activation.

## V2 addendum — registry-contributed sidebar panels (2026-07-19)

The V1 registry could *store* a `PanelContribution` but nothing rendered one: the type had no icon/group/pack, and the rail only knew its hardwired list. Both are now closed.

**Design:**

1. **Namespaced view ids, not a widened union.** A contributed panel's view id is `` `plugin:${contributionId}` `` (`PluginPanelViewId`); `SidebarView = SidebarViewId | PluginPanelViewId`. Widening `SidebarViewId` to `string` was rejected — it would forfeit exhaustiveness on the built-in switch and let a contribution shadow a built-in view. With a namespace, a plugin registering `id: "explorer"` yields `plugin:explorer`, which is a *different* view and cannot displace the real one.
2. **Persistence validates without the registry.** `isSidebarView` accepts the prefix shape alone, because sidebar state is restored from localStorage *before* any plugin registers. A persisted plugin view is therefore normally unresolved on first render.
3. **Unresolved ≠ invalid.** `PluginPanelSlot` renders a neutral "isn't available" state for a `missing` contribution rather than redirecting to the explorer. A redirect would silently discard the user's view on every launch, and would do so more often on slower machines — the failure would look like a preference that won't stick.
4. **The pack lives on the contribution.** `packForView()` only maps built-ins, so `PanelContribution.pack` is the gating source for contributed panels and `PackGatePlaceholder` takes an optional explicit `pack`. Same "enable this pack?" UI for both kinds.
5. **Ungrouped panels land in Advanced**, and `order` (default 0, tie-broken by title) keeps the rail stable as plugins register in nondeterministic order.

Resolution logic is pure and unit-tested in `src/modules/sidebar/pluginPanels.ts` — the awkward states (missing / gated / ready, bottom-vs-sidebar, ordering) are exactly what a DOM test could not check cheaply here.

**Migration path for built-ins (deliberately not started).** Moving a hardwired panel into the registry changes its persisted view id (`database` → `plugin:…`) and would orphan saved sidebar state and pinned-rail entries. Any such migration must therefore ship with a one-time id remap in `readSidebarView` and `loadPinned`, in the same change. That cost is why migration stays incremental and per-panel rather than a single sweep.
