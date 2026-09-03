---
type: subsystem
description: How the Windows E2E suite gets a WebDriver session — why the app must be built with a config overlay, and why tauri-driver is not used there.
---

# E2E harness

WDIO + Mocha driving a real release build. Nightly against `main` (`.github/workflows/e2e.yml`), plus manual dispatch. Specs live in `e2e/specs/`, config in `e2e/wdio.conf.ts`.

## The thing that is not obvious

**On Windows the debugging port is compiled into the build, not passed at launch.**

`tauri-driver` hands `--remote-debugging-port` to the app through the `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` environment variable. That variable never reaches the browser process, because wry always sets the explicit environment option — `wry/src/webview2/mod.rs`, `create_environment`, which calls `options.set_additional_browser_arguments(...)` unconditionally and defaults it to `--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection`. The explicit option supersedes the env var, so the port simply never opens.

The failure surfaces as `session not created: DevToolsActivePort file doesn't exist`, which reads like an msedgedriver/WebView2 version mismatch. It is not. That reading cost about a month (2026-07-17 → 2026-08-18) and a driver-pinning fix that was correct on its own terms and changed nothing. What settled it was launching the built binary directly with the flag set three ways (bare, `--user-data-dir`, `--remote-allow-origins=*`): port closed every time, no `DevToolsActivePort` file written anywhere.

So:

- `src-tauri/tauri.e2e.conf.json` sets `additionalBrowserArgs` with the debugging port, and `e2e.yml` builds via `tauri build --config src-tauri/tauri.e2e.conf.json`.
- `e2e/wdio.conf.ts` launches the app itself, waits for `/json/version` to answer, then attaches msedgedriver via `ms:edgeOptions.debuggerAddress`.
- **Linux still uses tauri-driver** — WebKitWebDriver has no equivalent problem.

## Two traps in the overlay

1. **Tauri merges config with RFC 7386, so an array is replaced, not merged.** `app.windows` is an array, so the overlay must restate the *whole* window object. A field added to `tauri.conf.json` alone silently disappears from the build the suite exercises.
2. **Setting `additionalBrowserArgs` replaces wry's defaults rather than appending to them**, so the overlay has to re-include `--disable-features=...` itself.

Both, plus port agreement between the overlay and `DEBUG_PORT` in `wdio.conf.ts`, are enforced by a tripwire in `src/lib/pitfall-guards.test.ts`.

**Shipping builds never use the overlay** — `release.yml` builds plain, so no released artifact exposes a debugging port. Keep it that way.

## First-run state is seeded, not fought

The job builds a release bundle on a clean runner, so the profile would be fresh on every run and `PackOnboardingDialog` would open every time. `e2e/wdio.conf.ts` now writes `packsOnboarded` and an explicit `enabledPacks` into the settings store **in `onPrepare`, before the app process starts** (`seedFirstRunPreferences`). Clearing the dialog from inside a spec was a race by construction — it mounts when preferences hydrate, which can land after the dismiss window opens.

The seed **merges** into an existing store rather than replacing it: the same path is a developer's real settings file when the suite is run locally.

`dismissStartupDialogs()` in `e2e/support/dialogs.ts` stays as the backstop for modals the suite does not control — `UpdaterDialog` opens itself whenever a published release is newer than the built version, which on a nightly job is release timing.

## The helper asserts clickability, not the absence of an overlay

This is the correction to how it worked until 2026-09-03, and the reasoning matters more than the code.

It used to poll `$('[data-slot="dialog-overlay"]').isExisting()` and treat any hit as "still blocked". That is a pure DOM query, and it does not mean what the suite needs it to mean. **Radix wraps `DialogOverlay` and `DialogContent` in separate `Presence` boundaries, and `Presence` unmounts on `animationend`** — an event a backgrounded or uncomposited WebView2 on a CI runner can simply never deliver. The content unmounts, the overlay is left behind inert, and the loop dismisses a ghost until it times out.

Run `33623555508` (2026-09-02) is the proof: `smoke`'s `before all` died after 20 s with *"A modal was still blocking the UI (an unnamed dialog)"* while `terminal.test.ts` — which calls the same helper and then clicks through the whole tab lifecycle — passed all three of its cases **in the same run**. Nothing was blocking. "(an unnamed dialog)" was the corroborating detail: the content carrying `dialog-title` had already unmounted, so there was no title left to report.

The predicate is now the invariant the specs actually depend on: **a known piece of app chrome is hit-testable**, via `isClickable()`, which resolves the element at the point. A real overlay fails it; a ghost does not. Dismissal is attempted only when dialog *content* is present, so the helper never fires Escape at an app that is merely still starting.

Two things that remain deliberate:

- **It targets any blocking modal, not the onboarding dialog by name.**
- **It waits for the anchor to stay clickable for a settle window**, rather than returning on the first clear poll. `App` renders chrome before it hydrates preferences, so a single clear poll leaves a window in which a hydration-gated dialog appears *after* the check.

On timeout it now reports whether a live dialog is mounted and its title, what element the anchor's hit point actually resolves to, and the `data-state` / `pointer-events` / `opacity` / `display` of every overlay — so the next failure of this class diagnoses itself instead of saying "an unnamed dialog".

A tripwire in `src/lib/pitfall-guards.test.ts` fails if any spec in `e2e/specs/` does not call `dismissStartupDialogs()`.

**When adding a spec that clicks anything, call it.** And note that `isEnabled()`/`isExisting()` are DOM queries that pass straight through an overlay; only `isClickable()` hit-tests the point.

## It gates PRs now, not just the nightly

As of 2026-09-03 `e2e.yml` also runs on pull requests to `main`, **path-scoped** to `src/**`, `src-tauri/**`, `e2e/**`, `package.json`, `pnpm-lock.yaml`, `vite.config.ts` and the workflow itself. A docs-only PR has no way to break a running app, and making it wait ~20 min for a release build to say so trains people to merge without reading the result. The Rust cache key is shared with `ci.yml`'s `test-rust`. The nightly run against `main` stays — it is what keeps covering drift the suite does not control (a WebView2 runtime roll, a newer release switching on `UpdaterDialog`).

## Known-stale corners

- `e2e/specs/terminal.test.ts` has 3 pre-existing type errors (WDIO's `ChainablePromiseArray.length` resolving as `Promise<number>`). Runtime is unaffected. Nothing typechecks `e2e/` in CI — `pnpm exec tsc --noEmit` uses the root tsconfig, which does not include it; check it by hand with `-p e2e/tsconfig.json`.
- msedgedriver is pinned to the installed **WebView2 Runtime** version, deliberately not the Edge browser version (`webview2RuntimeVersion()`). That pin is still right even though it was not the bug.

Related: [[release]], and the pitfall list in CLAUDE.md.
