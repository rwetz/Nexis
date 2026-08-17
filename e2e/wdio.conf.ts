// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import type { ChildProcess } from "child_process";
import { execFileSync, spawn } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

import type { Options } from "@wdio/types";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Path to the compiled release binary — must be built with `pnpm tauri build`
// before running tests.
const appBinary = resolve(
  __dirname,
  "..",
  "src-tauri",
  "target",
  "release",
  process.platform === "win32" ? "nexis.exe" : "nexis",
);

let tauriDriver: ChildProcess | undefined;

// Evergreen WebView2 Runtime's EdgeUpdate client id — stable, Microsoft-assigned.
const WEBVIEW2_CLIENT_GUID = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";

/// Version of the installed WebView2 *Runtime*, or undefined if not found.
///
/// This is deliberately not the installed Edge browser version. A Tauri app
/// renders in the WebView2 Runtime, and msedgedriver only speaks to a webview
/// whose build it matches; when the two drift, the driver launches the app but
/// never gets a debugging port, and the session fails with the singularly
/// unhelpful "session not created: DevToolsActivePort file doesn't exist".
///
/// That is not hypothetical: it took the nightly E2E job down for a month
/// starting 2026-07-17, when GitHub's windows-latest image rolled from
/// 20260628.158 to 20260714.173 and bumped Edge past the runtime.
function webview2RuntimeVersion(): string | undefined {
  // 32-bit view first: the runtime registers under WOW6432Node on x64 hosts.
  const keys = [
    `HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\${WEBVIEW2_CLIENT_GUID}`,
    `HKLM\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\${WEBVIEW2_CLIENT_GUID}`,
  ];
  for (const key of keys) {
    try {
      const out = execFileSync("reg", ["query", key, "/v", "pv"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const match = out.match(/pv\s+REG_SZ\s+([\d.]+)/i);
      if (match) return match[1];
    } catch {
      // Key absent in this hive — try the next one.
    }
  }
  return undefined;
}

export const config: Options.Testrunner = {
  hostname: "127.0.0.1",
  port: 4444,
  path: "/",

  specs: ["./specs/**/*.test.ts"],
  maxInstances: 1,

  capabilities: [
    {
      maxInstances: 1,
      browserName: "",
      "tauri:options": { application: appBinary },
      // Force WDIO v9 to stay on classic WebDriver protocol.  tauri-driver
      // proxies classic commands and is responsible for launching the app
      // binary.  Without this flag WDIO v9 auto-negotiates WebDriver BiDi via
      // the webSocketUrl returned in the session response, which points to the
      // native msedgedriver's BiDi endpoint and bypasses tauri-driver entirely
      // — causing the session to land on about:blank with no app launched.
      "wdio:enforceWebDriverClassic": true,
    },
  ],

  logLevel: "warn",
  bail: 0,
  waitforTimeout: 15_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 3,

  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    ui: "bdd",
    timeout: 60_000,
  },

  // Spawn tauri-driver before the test suite; it wraps the platform WebDriver
  // (msedgedriver on Windows, WebKitWebDriver on Linux) and launches the app.
  //
  // On Windows, tauri-driver requires msedgedriver.exe to be in PATH or passed
  // via --native-driver.  We use the "edgedriver" npm package (already a WDIO
  // transitive dep) to auto-download the exact version that matches the
  // installed Edge browser, then hand its path to tauri-driver directly.
  async onPrepare() {
    const extraArgs: string[] = [];
    if (process.platform === "win32") {
      // Use the edgedriver npm package to download the msedgedriver binary that
      // matches the installed Edge browser version, then hand its path to
      // tauri-driver via --native-driver (no system PATH entry required).
      //
      // The binary is cached in e2e/.drivers/ so subsequent runs are instant.
      const { download } = (await import("edgedriver")) as {
        download: (version?: string, cacheDir?: string) => Promise<string>;
      };
      const cacheDir = resolve(__dirname, ".drivers");

      // Pin the driver to the WebView2 Runtime build (see above). Falling back
      // to the package default keeps a runtime we cannot detect, or a version
      // with no published driver, from failing the run outright — it just
      // restores the previous (mismatch-prone) behaviour.
      const runtimeVersion = webview2RuntimeVersion();
      console.log(`[e2e] WebView2 Runtime version: ${runtimeVersion ?? "unknown"}`);

      let msedgedriverPath: string;
      try {
        msedgedriverPath = await download(runtimeVersion, cacheDir);
      } catch (e) {
        console.warn(
          `[e2e] no msedgedriver for WebView2 ${runtimeVersion ?? "unknown"} (${String(e)}) — ` +
            `falling back to the version matching the installed Edge browser`,
        );
        msedgedriverPath = await download(undefined, cacheDir);
      }
      // Log the driver's *own* reported version, not just the path — this is
      // the only way to confirm the pin above actually took effect rather than
      // silently resolving to whatever was already cached in e2e/.drivers/.
      let driverVersion = "unknown";
      try {
        driverVersion = execFileSync(msedgedriverPath, ["--version"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }).trim();
      } catch (e) {
        driverVersion = `could not query (${String(e)})`;
      }
      console.log(`[e2e] msedgedriver: ${msedgedriverPath}`);
      console.log(`[e2e] msedgedriver version: ${driverVersion}`);
      extraArgs.push("--native-driver", msedgedriverPath);
    }

    tauriDriver = spawn("tauri-driver", extraArgs, {
      stdio: [null, process.stdout, process.stderr],
    });
  },

  onComplete() {
    tauriDriver?.kill();
  },
};
