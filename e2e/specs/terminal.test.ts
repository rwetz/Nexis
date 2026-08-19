// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Terminal tab lifecycle: open via the "New tab" dropdown, verify xterm renders,
// then close the tab and verify it is removed from the tab bar.
//
// Note: xterm.js uses a WebGL renderer whose character output lives on a canvas,
// not in the DOM. Shell output inspection is therefore not attempted here; the
// presence of the .xterm host element is the proxy for "the shell is running."

import { dismissStartupDialogs } from "../support/dialogs.js";

describe("Terminal tab lifecycle", () => {
  let initialTabCount: number;

  before(async () => {
    // Wait for the app to finish initializing before counting tabs.
    //
    // We use waitForExist() (WebDriver findElement) rather than execute-script
    // because the JS execution context in WebView2 is not available until the
    // page has fully loaded, while element polling works at the protocol level
    // throughout the startup sequence.
    await $("[data-tauri-drag-region]").waitForExist({
      timeout: 60_000,
      timeoutMsg: "App did not initialize within 60 s",
    });

    // Every click below goes through app chrome, and a first-run modal's
    // overlay would receive all of them instead. Clear it before counting
    // anything — see e2e/support/dialogs.ts.
    await dismissStartupDialogs();

    // Record the number of tabs already open when the test suite starts.
    // The app may launch with a default tab, so tests are written relative to
    // this baseline rather than assuming zero tabs.
    await $('button[title="New tab"]').waitForExist({ timeout: 30_000 });
    const tabs = await $$("[data-tab-id]");
    initialTabCount = tabs.length;
  });

  it("new-tab dropdown adds a Terminal tab", async () => {
    // Open the "+" dropdown
    const btn = await $('button[title="New tab"]');
    await btn.waitForExist({ timeout: 10_000 });
    await btn.click();

    // Click the "Terminal" entry.  XPath finds the menuitem whose child span
    // reads exactly "Terminal", which avoids matching "New Window" etc.
    const terminalItem = await $(
      '//div[@role="menuitem"][.//span[text()="Terminal"]]',
    );
    await terminalItem.waitForExist({ timeout: 5_000 });
    await terminalItem.click();

    // Tab trigger should appear in the tab bar
    await browser.waitUntil(
      async () => (await $$("[data-tab-id]")).length > initialTabCount,
      { timeout: 15_000, interval: 300 },
    );

    const tabCount = (await $$("[data-tab-id]")).length;
    expect(tabCount).toBe(initialTabCount + 1);
  });

  it("xterm pane is present after terminal tab opens", async () => {
    // xterm.js attaches class="xterm" to the host it opens into
    const xterm = await $(".xterm");
    await xterm.waitForExist({ timeout: 15_000 });
    expect(await xterm.isExisting()).toBe(true);
  });

  it("close button removes the tab from the tab bar", async () => {
    const countBefore = (await $$("[data-tab-id]")).length;

    // The active tab's close affordance has aria-label="Close tab"
    const closeBtn = await $('[aria-label="Close tab"]');
    await closeBtn.waitForExist({ timeout: 5_000 });
    await closeBtn.click();

    await browser.waitUntil(
      async () => (await $$("[data-tab-id]")).length < countBefore,
      { timeout: 10_000, interval: 300 },
    );

    expect((await $$("[data-tab-id]")).length).toBe(countBefore - 1);
  });
});
