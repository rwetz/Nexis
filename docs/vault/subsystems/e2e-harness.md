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

## Every run is a first run

The job builds a release bundle on a clean runner, so the profile is always fresh and **`PackOnboardingDialog` opens on every single run**. Its Radix overlay is `fixed inset-0` at `z-50` with `pointer-events: auto`, so it receives every click meant for app chrome. WebDriver reports that as `element click intercepted … Other element would receive the click: <div data-slot="dialog-overlay">` — the overlay is named, the dialog never is.

The failure then surfaces far from its cause. With the terminal spec unable to open the new-tab dropdown, no terminal tab existed, and the run's reported error was `element (".xterm") still not existing after 15000ms` — 15 seconds downstream, pointing at the PTY layer instead of at a modal.

Both specs now await `dismissStartupDialogs()` from `e2e/support/dialogs.ts` in their `before()` hook. Three things about it are deliberate:

- **It targets any blocking modal, not the onboarding dialog by name.** `UpdaterDialog` opens itself the same way whenever a published release is newer than the built version — on a nightly job that is release timing, not something the suite controls.
- **It waits for the viewport to stay clear, rather than returning on the first clear poll.** `App` renders its chrome before it hydrates preferences (`initPrefs()` runs in a `useEffect`), so `[data-tauri-drag-region]` exists while `hydrated` is still false and the dialog has not mounted yet. A single clear poll would leave a window in which the dialog appears *after* the check and covers the control the spec is about to click.
- **Escape is the fallback, not the primary.** The close button is the affordance a user has, but `AlertDialogContent` renders none and a stacked dialog's button can itself be covered. On an alert dialog Escape maps to cancel, which is the non-destructive choice.

Dismissal persists (`packsOnboarded`), so only the first spec in a run pays for it.

A tripwire in `src/lib/pitfall-guards.test.ts` fails if any spec in `e2e/specs/` does not call `dismissStartupDialogs()` — every new spec inherits the same first-run profile.

**When adding a spec that clicks anything, call it.** And note that `isEnabled()`/`isExisting()` are DOM queries that pass straight through an overlay; only `isClickable()` hit-tests the point. That is exactly how the smoke spec passed while the UI was entirely unclickable, and why it now asserts `isClickable()` on the new-tab button.

## Known-stale corners

- `e2e/specs/terminal.test.ts` has 3 pre-existing type errors (WDIO's `ChainablePromiseArray.length` resolving as `Promise<number>`). Runtime is unaffected. Nothing typechecks `e2e/` in CI — `pnpm exec tsc --noEmit` uses the root tsconfig, which does not include it; check it by hand with `-p e2e/tsconfig.json`.
- msedgedriver is pinned to the installed **WebView2 Runtime** version, deliberately not the Edge browser version (`webview2RuntimeVersion()`). That pin is still right even though it was not the bug.

Related: [[release]], and the pitfall list in CLAUDE.md.
