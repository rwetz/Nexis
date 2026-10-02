import { mkdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { dismissStartupDialogs } from "../support/dialogs.js";
import { Screencast } from "../support/screencast.js";

/**
 * Real-motion clips for the nexisdev.org product tour, recorded from the
 * webview itself (see support/screencast.ts). Windows only, since it needs the
 * E2E build's DevTools port, and FFmpeg on PATH.
 *
 * Skipped unless NEXIS_CLIPS=1. Build and run like the screenshot spec:
 *
 *   pnpm tauri build --no-bundle --config src-tauri/tauri.screenshots.conf.json
 *   NEXIS_CLIPS=1 NEXIS_E2E_WORKSPACE=. pnpm test:e2e --spec e2e/specs/clips.test.ts
 *
 * MP4s (1600×1000, 30 fps) go to NEXIS_CLIP_DIR, default e2e/clips/ (gitignored).
 * Each clip is its own test, so one surface failing doesn't cost the rest.
 * Nothing here sends a prompt to an AI provider: the AI clip shows the idle orb.
 */
const enabled = process.env.NEXIS_CLIPS === "1" && process.platform === "win32";
const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.env.NEXIS_CLIP_DIR ?? join(here, "..", "clips"));
const rootParam = process.env.NEXIS_E2E_WORKSPACE
  ? `&root=${encodeURIComponent(resolve(process.env.NEXIS_E2E_WORKSPACE))}`
  : "";

const cast = new Screencast();
const wait = (ms: number) => browser.pause(ms);

/** Type like a person: one key at a time. */
async function typeSlowly(text: string, delay = 70) {
  for (const ch of text) {
    await browser.keys(ch);
    await wait(delay);
  }
}

async function cmd(query: string) {
  await browser.keys(["Control", "Shift", "p"]);
  const input = $('input[placeholder="Type a command…"]');
  await input.waitForDisplayed();
  await input.setValue(query);
  await $("[cmdk-item]").waitForDisplayed();
  await browser.keys("Enter");
  await wait(400);
}

async function home() {
  await browser.execute(() => window.location.assign("/"));
  await $("[data-tauri-drag-region]").waitForExist({ timeout: 60_000 });
  await dismissStartupDialogs();
  await wait(1500);
}

async function settle() {
  await browser.keys("Escape");
  await wait(400);
}

(enabled ? describe : describe.skip)("Marketing clips", () => {
  before(async () => {
    mkdirSync(outDir, { recursive: true });
    await $("[data-tauri-drag-region]").waitForExist({ timeout: 60_000 });
    await dismissStartupDialogs();
    await wait(3000);
    await cast.connect();
  });

  after(() => cast.close());

  afterEach(settle);

  it("terminal", async () => {
    await $(".xterm").waitForDisplayed({ timeout: 30_000 });
    await $(".xterm").click();
    await wait(300);
    await cast.record(outDir, "terminal", async () => {
      await wait(500);
      // One action: xterm drops keys when they arrive one WebDriver round trip apart.
      await browser.keys("git log --oneline --graph -14");
      await browser.keys("Enter");
      await wait(1800);
    });
  });

  it("spotlight", async () => {
    await cast.record(outDir, "spotlight", async () => {
      await wait(500);
      await browser.keys(["Control", "p"]);
      await $('[role="dialog"][aria-label="Spotlight"]').waitForDisplayed();
      await wait(900);
      await typeSlowly("mtx", 180);
      await $('[role="listbox"][aria-label="Results"] [role="option"]').waitForDisplayed({ timeout: 20_000 });
      await wait(1100);
      for (let i = 0; i < 3; i += 1) {
        await browser.keys("ArrowDown");
        await wait(550);
      }
      await wait(600);
      await browser.keys("Enter");
      await wait(1300);
    });
  });

  it("ai-orb", async () => {
    await cast.record(outDir, "ai-orb", async () => {
      await wait(300);
      await cmd("Toggle AI panel");
      await wait(4200);
    });
    await cmd("Toggle AI panel");
  });

  it("themes", async () => {
    await cmd("Open theme settings");
    await $('[role="dialog"]').waitForDisplayed();
    await wait(1000);
    await cast.record(outDir, "themes", async () => {
      await wait(500);
      for (const name of ["Halcyon", "Aurelian", "Glacier", "Synthwave", "Nexis Default"]) {
        const card = $(`//*[normalize-space(text())="${name}"]`);
        if (await card.isExisting()) {
          await card.click();
          await wait(950);
        }
      }
    });
  });

  it("documents", async () => {
    await browser.execute((q) => window.location.assign(`/?${q}`), "tool=documents" + rootParam);
    await cast.record(outDir, "documents", async () => {
      await $("main.nexis-window-body").waitForExist({ timeout: 30_000 });
      const file = $("button*=CONTRIBUTING.md");
      await file.waitForDisplayed({ timeout: 20_000 });
      await wait(900);
      await file.click();
      await wait(1400);
      const editor = $(".ProseMirror");
      if (await editor.isExisting()) {
        await editor.click();
        await browser.keys(["Control", "End"]);
        await browser.keys("Enter");
        // One action: per-key WebDriver round trips are ~0.5 s each and read as sluggish.
        await browser.keys("Recorded live in the Documents window.");
        await wait(1200);
      }
    });
    await home();
  });

  it("svg-studio", async () => {
    await browser.execute((q) => window.location.assign(`/?${q}`), "tool=svg-studio&studio=backdrop" + rootParam);
    await cast.record(outDir, "svg-studio", async () => {
      await $("main.nexis-window-body").waitForExist({ timeout: 30_000 });
      await wait(3500);
    });
    await home();
  });

  it("welcome", async () => {
    for (let i = 0; i < 9; i += 1) {
      const tabs = await $$('[role="tab"]').length;
      if (tabs <= 1) break;
      await cmd("Close current tab");
      await wait(400);
    }
    await cast.record(outDir, "welcome", async () => {
      // Closing the last tab brings up the welcome screen, whose wordmark assembles from particles.
      await cmd("Close current tab");
      await wait(4500);
    });
  });
});
