import { dismissStartupDialogs } from "../support/dialogs.js";

async function palette(query: string) {
  await browser.keys(["Control", "Shift", "p"]);
  const input = $('input[placeholder="Type a command…"]');
  await input.waitForDisplayed();
  await input.setValue(query);
}

/**
 * Load a tool window's route in this webview. The Web window is a separate
 * native window, which WebDriver's session does not follow, so its body is
 * checked at its own route; `leaveToolWindow` comes back to the main window.
 */
async function openToolRoute(query: string) {
  await browser.execute((q) => window.location.assign(`/?${q}`), query);
  await $("main.nexis-window-body").waitForExist({ timeout: 30_000 });
}

async function leaveToolWindow() {
  await browser.execute(() => window.location.assign("/"));
  await $("[data-tauri-drag-region]").waitForExist({ timeout: 60_000 });
  await dismissStartupDialogs();
}

async function runCommand(query: string) {
  await palette(query);
  const command = $('[cmdk-item]');
  await command.waitForDisplayed();
  await command.click();
}

describe("Contributed workbench panels", () => {
  before(async () => {
    await $("[data-tauri-drag-region]").waitForExist({ timeout: 60_000 });
    await dismissStartupDialogs();
  });

  it("renders lazy Web Tools in the Web window", async () => {
    // Web Tools lives in the Web window; `web=` is how "Show web tools"
    // asks for it, and the contribution renders its lazy body there.
    await openToolRoute("tool=web&web=web-tools");
    const panel = $('[data-panel-id="webdev:tools"]');
    await panel.waitForDisplayed();
    await panel.$("textarea").waitForExist();
    await leaveToolWindow();
  });

  it("restores a lazy sidebar panel's saved view across a reload", async () => {
    // Share is a contributed, lazily loaded panel that still lives in the
    // sidebar; its selection is persisted, so a reload must bring it back.
    // (Web, SVG Studio, ML Lab and Documents are windows, not sidebar views.)
    await runCommand("Show Share");
    const panel = $('[data-panel-id="share:terminal"]');
    await panel.waitForDisplayed();
    await panel.$("button").waitForExist();
    await browser.refresh();
    await panel.waitForDisplayed({ timeout: 30_000 });
    await panel.$("button").waitForExist();
  });

  it("migrates a legacy saved session view into the bottom panel", async () => {
    await browser.execute(() => localStorage.setItem("nexis.sidebar.view", "build"));
    await browser.refresh();

    const panel = $("[data-bottom-panel]");
    await panel.waitForDisplayed({ timeout: 30_000 });
    const buildTab = panel.$('[role="tab"]*=Build');
    await buildTab.waitForDisplayed();
    expect(await buildTab.getAttribute("aria-selected")).toBe("true");
    expect(await browser.execute(() => localStorage.getItem("nexis.sidebar.view"))).toBe("explorer");

    await panel.$('button[aria-label="Maximize panel"]').click();
    await panel.$('button[aria-label="Restore panel"]').waitForDisplayed();
    await panel.$('button[aria-label="Restore panel"]').click();
    await panel.$('button[aria-label="Close panel"]').click();
    await panel.waitForDisplayed({ reverse: true });
  });

  it("mounts a migrated integration panel through the Web window's host", async () => {
    // HTTP Client needs the integration host (workspace key, preview
    // opener), which the Web window supplies in place of the main window's.
    await openToolRoute("tool=web&web=http-client");
    const panel = $('[data-panel-id="webdev:http-client"]');
    await panel.waitForDisplayed();
    await panel.$("span*=HTTP Client").waitForDisplayed();
    await leaveToolWindow();
  });

  it("admits the Atlas refresh command only while Atlas is selected", async () => {
    await runCommand("Show Atlas (every");
    await $('[data-panel-id="atlas:main"]').waitForDisplayed();
    await palette("Atlas: Refresh repositories");
    await $('[cmdk-item]').waitForDisplayed();
    expect(await $('[cmdk-item]').getText()).toContain("Atlas: Refresh repositories");
    await browser.keys("Escape");
    await runCommand("Show file explorer");
    await palette("Atlas: Refresh repositories");
    await $('[cmdk-empty]').waitForDisplayed();
    expect(await $('[cmdk-item]').isExisting()).toBe(false);
    await browser.keys("Escape");
  });
});
