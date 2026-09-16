import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { dismissStartupDialogs } from "../support/dialogs.js";

function availableDistro(): string | null {
  try {
    return execFileSync("wsl.exe", ["--list", "--quiet"], { encoding: "utf16le", windowsHide: true }).split(/\r?\n/).map((name) => name.trim()).find(Boolean) ?? null;
  } catch { return null; }
}

function removeTestDirectory(path: string, parent: string) {
  const target = resolve(path);
  if (dirname(target) !== resolve(parent) || !basename(target).startsWith("nexis-e2e-")) {
    throw new Error(`Refusing cleanup outside the test directory: ${target}`);
  }
  rmSync(target, { recursive: true, force: true });
}

describe("Real platform adapters", () => {
  const local = mkdtempSync(join(tmpdir(), "nexis-e2e-"));
  const other = existsSync("G:/") ? mkdtempSync("G:/nexis-e2e-") : null;
  const distro = availableDistro();
  before(async () => {
    await $("[data-tauri-drag-region]").waitForExist({ timeout: 60_000 });
    await dismissStartupDialogs();
  });
  after(() => {
    removeTestDirectory(local, tmpdir());
    if (other) removeTestDirectory(other, "G:/");
  });

  it("starts PowerShell, preserves rapid input and repeatedly closes/reopens across drives", async function () {
    this.timeout(120_000);
    for (const cwd of [local, other ?? local, local]) {
      const id = await browser.execute(
        async (root) => window.nexisE2e.terminalStart(root, { kind: "local" }),
        cwd,
      );
      try {
        await browser.execute(
          async (terminalId, command) =>
            window.nexisE2e.terminalWrite(terminalId, command),
          id,
          "Write-Output ('NEXIS_E2E_' + 'RAPID')\r",
        );
        let observed = "";
        try {
          await browser.waitUntil(
            async () => {
              observed = await browser.execute(
                (terminalId) => window.nexisE2e.terminalOutput(terminalId),
                id,
              );
              return observed.includes("NEXIS_E2E_RAPID");
            },
            { timeout: 20_000 },
          );
        } catch {
          throw new Error(
            `PowerShell did not echo ordered rapid input in ${cwd}; output=${JSON.stringify(observed.slice(-500))}`,
          );
        }
      } finally {
        await browser.execute(
          async (terminalId) => window.nexisE2e.terminalClose(terminalId),
          id,
        );
      }
      const processCwd = await browser.execute(
        async (root) => window.nexisE2e.processCycle(root, { kind: "local" }),
        cwd,
      );
      expect(processCwd.replaceAll("\\", "/").toLowerCase()).toBe(
        cwd.replaceAll("\\", "/").toLowerCase(),
      );
    }
  });

  (distro ? it : it.skip)("writes, replaces, renames and reads WSL files through the caller's Linux paths", async () => {
    const root = `/tmp/nexis-e2e-${Date.now()}`;
    const cwd = await browser.execute(
      async (path, distribution) => window.nexisE2e.wslFiles(path, distribution),
      root,
      distro!,
    );
    expect(cwd).toBe(root);
  });
});
