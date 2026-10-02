import { mkdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { dismissStartupDialogs } from "../support/dialogs.js";

/**
 * Marketing screenshots for nexisdev.org and the wiki, captured from the real
 * build.
 *
 * Skipped unless NEXIS_SCREENSHOTS=1, so the regular suite never spends time
 * here. Build with the screenshot overlay (same as the E2E overlay, at a
 * 1600×1000 window) and point the app at a repo so the editor, explorer and
 * Source Control have something to show:
 *
 *   pnpm tauri build --no-bundle --config src-tauri/tauri.screenshots.conf.json
 *   NEXIS_SCREENSHOTS=1 NEXIS_E2E_WORKSPACE=. pnpm test:e2e --spec e2e/specs/screenshots.test.ts
 *
 * PNGs go to NEXIS_SCREENSHOT_DIR, defaulting to e2e/screenshots/ (gitignored)
 * so a run never overwrites the sites' images until you choose to copy them.
 *
 * Atlas lists every repo its `atlas.toml` finds. Point that file at public
 * repos before a run, or the shot publishes private repo names.
 *
 * Tool windows are separate native windows that the WebDriver session does
 * not follow, so each is captured by loading its route in this webview, as
 * workbench.test.ts does. Each shot is its own test, so one surface that
 * fails to open does not cost the rest.
 */
const enabled = process.env.NEXIS_SCREENSHOTS === "1";
const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.env.NEXIS_SCREENSHOT_DIR ?? join(here, "..", "screenshots"));
/** The main window hands tool windows its root in the launch URL; do the same. */
const rootParam = process.env.NEXIS_E2E_WORKSPACE
  ? `&root=${encodeURIComponent(resolve(process.env.NEXIS_E2E_WORKSPACE))}`
  : "";

async function shot(name: string) {
  // Let springs, glides and shader first frames settle before capturing.
  await browser.pause(1500);
  await browser.saveScreenshot(join(outDir, `${name}.png`));
}

async function mainWindow() {
  await $("[data-tauri-drag-region]").waitForExist({ timeout: 60_000 });
  await dismissStartupDialogs();
}

async function home() {
  await browser.execute(() => window.location.assign("/"));
  await mainWindow();
  await browser.pause(1500);
}

async function toolWindow(query: string) {
  await browser.execute((q) => window.location.assign(`/?${q}`), query + rootParam);
  await $("main.nexis-window-body").waitForExist({ timeout: 30_000 });
}

/** Run the first palette command matching `query`. */
async function cmd(query: string) {
  await browser.keys(["Control", "Shift", "p"]);
  const input = $('input[placeholder="Type a command…"]');
  await input.waitForDisplayed();
  await input.setValue(query);
  await $("[cmdk-item]").waitForDisplayed();
  await browser.keys("Enter");
  await browser.pause(400);
}

/** Open a workspace file through Spotlight, the way a person would. */
async function openFile(query: string) {
  await browser.keys(["Control", "p"]);
  await $('[role="dialog"][aria-label="Spotlight"]').waitForDisplayed();
  await browser.keys(query);
  await $('[role="listbox"][aria-label="Results"] [role="option"]').waitForDisplayed({ timeout: 20_000 });
  await browser.pause(400);
  await browser.keys("Enter");
  await browser.pause(800);
}

async function type(text: string) {
  await browser.keys(text);
  await browser.keys("Enter");
}

async function rail(label: string) {
  const button = $(`button[aria-label="${label}"]`);
  await button.waitForDisplayed();
  await button.click();
}

(enabled ? describe : describe.skip)("Marketing screenshots", () => {
  before(async () => {
    mkdirSync(outDir, { recursive: true });
    await mainWindow();
    await browser.pause(3000);
  });

  afterEach(async () => {
    await browser.keys("Escape");
    await browser.pause(200);
  });

  it("terminal", async () => {
    await $(".xterm").waitForDisplayed({ timeout: 30_000 });
    await $(".xterm").click();
    await type("git log --oneline -12");
    await cmd("Split pane right");
    await browser.pause(2500);
    await type("git status --short --branch");
    await browser.pause(2000);
    await shot("terminal");
  });

  it("editor", async () => {
    await openFile("toolWindow.ts");
    await $(".cm-editor").waitForDisplayed({ timeout: 20_000 });
    await shot("editor");
  });

  it("outline", async () => {
    await rail("Outline");
    await shot("outline");
    await rail("Files");
  });

  it("spotlight", async () => {
    await browser.keys(["Control", "p"]);
    await $('[role="dialog"][aria-label="Spotlight"]').waitForDisplayed();
    await browser.keys("mtx");
    await $('[role="listbox"][aria-label="Results"] [role="option"]').waitForDisplayed({ timeout: 20_000 });
    await shot("spotlight");
  });

  it("markdown", async () => {
    await openFile("README.md");
    await shot("markdown");
  });

  it("source-control", async () => {
    await cmd("Show source control");
    await shot("source-control");
    await rail("Files");
  });

  it("ai", async () => {
    await cmd("Toggle AI panel");
    await shot("ai");
    await cmd("Toggle AI panel");
  });

  it("bottom-panel", async () => {
    await cmd("Show system monitor");
    await $("[data-bottom-panel]").waitForDisplayed({ timeout: 15_000 });
    await browser.pause(2500);
    await shot("bottom-panel");
    await cmd("Toggle bottom panel");
  });

  it("high-contrast", async () => {
    await cmd("Toggle high contrast");
    await shot("high-contrast");
    await cmd("Toggle high contrast");
  });

  it("palette", async () => {
    await browser.keys(["Control", "Shift", "p"]);
    await $('input[placeholder="Type a command…"]').waitForDisplayed();
    await browser.keys("open");
    await shot("palette");
  });

  for (const [name, section] of [
    ["settings", "General"],
    ["features", "Features"],
    ["themes", "Themes"],
    ["orb", "Orb"],
    ["models", "Models"],
  ] as const) {
    it(`settings: ${name}`, async () => {
      await cmd("Open settings");
      const dialog = $('[role="dialog"]');
      await dialog.waitForDisplayed();
      const nav = dialog.$(`button*=${section}`);
      if (await nav.isExisting()) await nav.click();
      await browser.pause(1200);
      await shot(name);
    });
  }

  it("shortcuts", async () => {
    await cmd("Open keyboard shortcuts");
    await shot("shortcuts");
  });

  it("welcome", async () => {
    // The welcome screen shows once no tabs are left.
    await home();
    for (let i = 0; i < 10; i += 1) {
      if (await $("*=Welcome to Nexis").isExisting()) break;
      await cmd("Close current tab");
      await browser.pause(600);
    }
    await browser.pause(4000);
    await shot("welcome");
  });

  for (const [name, query] of [
    ["atlas", "tool=atlas"],
    ["benchmark", "tool=benchmark"],
    ["svg-studio", "tool=svg-studio&studio=backdrop"],
    ["svg-palette", "tool=svg-studio&studio=palette"],
    ["ml-lab", "tool=ml-lab"],
    ["web", "tool=web&web=http-client"],
    ["documents", "tool=documents"],
  ] as const) {
    it(name, async () => {
      await toolWindow(query);
      await browser.pause(3000);
      await shot(name);
    });
  }

  it("web-tools", async () => {
    await toolWindow("tool=web&web=web-tools");
    const input = $('textarea[placeholder="Paste JSON"]');
    await input.waitForDisplayed({ timeout: 20_000 });
    await input.setValue(
      '{"name":"nexis","version":"1.30.1","workbenches":["SVG Studio","ML Lab","Web","Documents"],"packs":{"art":true,"documents":true}}',
    );
    await browser.pause(1500);
    await shot("web-tools");
  });

  it("documents-editor", async () => {
    await toolWindow("tool=documents");
    const file = $("button*=CONTRIBUTING.md");
    await file.waitForDisplayed({ timeout: 20_000 });
    await file.click();
    await browser.pause(2500);
    await shot("documents-editor");
  });

  after(async () => {
    await home();
  });
});
