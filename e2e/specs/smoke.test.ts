// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Smoke tests: verify the app launches and critical shell chrome is present.
// These run first and establish that tauri-driver connected successfully.

import { dismissStartupDialogs } from "../support/dialogs.js";

describe("App launch smoke", () => {
  before(async () => {
    // The Tauri webview may not have finished loading when WebDriver first
    // connects (window starts hidden then shows after JS init).  Wait up to
    // 60 s for the drag-region element to appear before running any assertions.
    //
    // We use waitForExist() (WebDriver findElement) rather than execute-script
    // because the JS execution context in WebView2 is not available until the
    // page has fully loaded, while element polling works at the protocol level
    // throughout the startup sequence.
    await $("[data-tauri-drag-region]").waitForExist({
      timeout: 60_000,
      timeoutMsg: "App did not initialize within 60 s",
    });

    // This spec runs first, so it is where the first-run modal is met and
    // cleared. Dismissal is persisted (`packsOnboarded`), which is why the
    // later specs find nothing to close — see e2e/support/dialogs.ts.
    await dismissStartupDialogs();
  });

  it("window title is Nexis", async () => {
    expect(await browser.execute(() => document.title)).toBe("Nexis");
  });

  it("tab-bar scroll region is in the DOM", async () => {
    // The TabBar mounts a div[data-tauri-drag-region] that wraps all tab triggers.
    const dragRegion = await $("[data-tauri-drag-region]");
    await dragRegion.waitForExist({ timeout: 30_000 });
    expect(await dragRegion.isExisting()).toBe(true);
  });

  it("new-tab trigger button is present and clickable", async () => {
    const btn = await $('button[title="New tab"]');
    await btn.waitForExist({ timeout: 30_000 });
    expect(await btn.isEnabled()).toBe(true);
    // isEnabled() is a DOM query and says nothing about whether a click would
    // land. That is exactly how a full-viewport modal overlay passed this
    // spec while making the whole UI unclickable, leaving the terminal spec
    // to report the damage as a missing .xterm 15 s later. isClickable()
    // hit-tests the point, so the occlusion fails here, where it is legible.
    expect(await btn.isClickable()).toBe(true);
  });
});
