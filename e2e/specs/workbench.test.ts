import { dismissStartupDialogs } from "../support/dialogs.js";

async function palette(query: string) {
  await browser.keys(["Control", "Shift", "p"]);
  const input = $('input[placeholder="Type a command…"]');
  await input.waitForDisplayed();
  await input.setValue(query);
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

  it("opens lazy Web Tools through its registered command and restores its saved view", async () => {
    await runCommand("Show web tools");
    const panel = $('[data-panel-id="webdev:tools"]');
    await panel.waitForDisplayed();
    await panel.$("textarea").waitForExist();
    await browser.refresh();
    await panel.waitForDisplayed({ timeout: 30_000 });
    await panel.$("textarea").waitForExist();
  });

  it("mounts a migrated integration panel through its capability host", async () => {
    await $('button[aria-label="More panels"]').click();
    const httpClient = $("button=HTTP Client");
    await httpClient.waitForDisplayed();
    await httpClient.click();
    const panel = $('[data-panel-id="webdev:http-client"]');
    await panel.waitForDisplayed();
    await panel.$("span*=HTTP Client").waitForDisplayed();
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
