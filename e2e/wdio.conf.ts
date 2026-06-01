import type { ChildProcess } from "child_process";
import { spawn } from "child_process";
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
      const msedgedriverPath = await download(undefined, cacheDir);
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
