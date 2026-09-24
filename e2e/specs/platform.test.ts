import { mkdtempSync, realpathSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { dismissStartupDialogs } from "../support/dialogs.js";

function availableDistro(): string | null {
  try {
    const distro = execFileSync("wsl.exe", ["--list", "--quiet"], {
      encoding: "utf16le",
      timeout: 15_000,
      windowsHide: true,
    })
      .split(/\r?\n/)
      .map((name) => name.trim())
      .find(Boolean);
    if (!distro) return null;

    // A registered distro is not necessarily usable. WslService can be
    // stopped or can terminate during startup, in which case wsl.exe hangs
    // and WebDriver misreports the eventual script timeout as a renderer
    // failure. Require one bounded command before enabling the real WSL case.
    execFileSync("wsl.exe", ["-d", distro, "--exec", "true"], {
      timeout: 15_000,
      windowsHide: true,
      stdio: "ignore",
    });
    return distro;
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
  // Canonical long form. On the Windows runner `tmpdir()` is the 8.3 short
  // name (`RUNNER~1`) while the app reports a process cwd in its long form
  // (`runneradmin`): the same directory, spelled two ways, so the cwd
  // comparison below failed on every run, main's nightly included.
  const tmpRoot = realpathSync.native(tmpdir());
  const local = mkdtempSync(join(tmpRoot, "nexis-e2e-"));
  const other = existsSync("G:/") ? mkdtempSync("G:/nexis-e2e-") : null;
  const distro = availableDistro();
  before(async () => {
    await $("[data-tauri-drag-region]").waitForExist({ timeout: 60_000 });
    await dismissStartupDialogs();
  });
  after(() => {
    removeTestDirectory(local, tmpRoot);
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
