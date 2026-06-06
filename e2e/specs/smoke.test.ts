// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

// Smoke tests: verify the app launches and critical shell chrome is present.
// These run first and establish that tauri-driver connected successfully.

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

  it("new-tab trigger button is present and enabled", async () => {
    const btn = await $('button[title="New tab"]');
    await btn.waitForExist({ timeout: 30_000 });
    expect(await btn.isEnabled()).toBe(true);
  });
});
