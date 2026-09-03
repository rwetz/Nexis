// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import type { ChildProcess } from "child_process";
import { execFileSync, spawn } from "child_process";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";


const __dirname = dirname(fileURLToPath(import.meta.url));

// Path to the compiled release binary — must be built with `pnpm tauri build`
// before running tests. On Windows it must additionally be built with the
// E2E config overlay; see DEBUG_PORT below.
const appBinary = resolve(
  __dirname,
  "..",
  "src-tauri",
  "target",
  "release",
  process.platform === "win32" ? "nexis.exe" : "nexis",
);

const isWindows = process.platform === "win32";

/// The DevTools port the app is built to expose on Windows.
///
/// This is NOT passed at launch — it is compiled into the bundle by
/// `src-tauri/tauri.e2e.conf.json`, and the two must agree. See the comment on
/// `startWindowsHarness` for why it cannot be passed at launch.
const DEBUG_PORT = 9222;
const DRIVER_PORT = 4444;

/// Tauri's `identifier` from tauri.conf.json — the app-data directory name.
const APP_IDENTIFIER = "app.nexis.nexis";
/// `STORE_PATH` in src/modules/settings/store.ts.
const SETTINGS_FILE = "nexis-settings.json";

/// The directory `@tauri-apps/plugin-store` resolves `nexis-settings.json`
/// against — Tauri v2's `app_data_dir`, which is the platform data dir plus
/// the bundle identifier.
function appDataDir(): string {
  if (process.platform === "win32") {
    return join(
      process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
      APP_IDENTIFIER,
    );
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", APP_IDENTIFIER);
  }
  return join(
    process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
    APP_IDENTIFIER,
  );
}

/// Put first-run preferences into a known state *before* the app starts.
///
/// Without this the suite is a coin flip on anything gated behind
/// `hydrated && !<some pref>`. `PackOnboardingDialog` is the current case: on
/// a clean runner every run is a first run, so it opens as soon as preferences
/// hydrate and its overlay covers the chrome the specs click. Clearing it from
/// inside a spec is a race by construction — the dialog mounts when hydration
/// lands, which can be after the dismiss window opens.
///
/// Seeding it here removes the race rather than widening the timeout around
/// it. `dismissStartupDialogs()` stays as the backstop for modals the suite
/// does not control (`UpdaterDialog` opens on release timing).
///
/// This **merges** into any existing store rather than replacing it: the same
/// path is a developer's real settings file when the suite is run locally, and
/// a test harness has no business discarding it.
function seedFirstRunPreferences(): void {
  const dir = appDataDir();
  const file = join(dir, SETTINGS_FILE);

  let existing: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      existing = parsed as Record<string, unknown>;
    }
  } catch {
    // No store yet (the clean-runner case), or it is unreadable/corrupt.
    // Either way the seed below is what the app should start from.
  }

  // `enabledPacks` is seeded alongside `packsOnboarded` on purpose. Marking
  // onboarding done without stating the pack config would leave the surface
  // under test dependent on DEFAULT_PREFERENCES, so a future change to that
  // default would silently change which panels the suite exercises.
  const seeded = {
    ...existing,
    packsOnboarded: true,
    enabledPacks: [
      "navigation-plus",
      "code-tools",
      "ai-extras",
      "dev-tools",
      "ml-lab",
      "advanced",
    ],
  };

  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(seeded, null, 2), "utf8");
    console.log(`[e2e] seeded first-run preferences: ${file}`);
  } catch (e) {
    // Not fatal: dismissStartupDialogs() is still there to clear the dialog.
    console.warn(`[e2e] could not seed preferences at ${file}: ${String(e)}`);
  }
}

let tauriDriver: ChildProcess | undefined;
let nativeDriver: ChildProcess | undefined;
let appProcess: ChildProcess | undefined;

// Evergreen WebView2 Runtime's EdgeUpdate client id — stable, Microsoft-assigned.
const WEBVIEW2_CLIENT_GUID = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";

/// Version of the installed WebView2 *Runtime*, or undefined if not found.
///
/// This is deliberately not the installed Edge browser version. A Tauri app
/// renders in the WebView2 Runtime, and msedgedriver only speaks to a webview
/// whose build it matches; when the two drift, the driver attaches to the app
/// but the session fails.
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

/// Resolve an msedgedriver binary pinned to the installed WebView2 Runtime.
async function resolveMsedgedriver(): Promise<string> {
  const { download } = (await import("edgedriver")) as {
    download: (version?: string, cacheDir?: string) => Promise<string>;
  };
  const cacheDir = resolve(__dirname, ".drivers");

  const runtimeVersion = webview2RuntimeVersion();
  console.log(`[e2e] WebView2 Runtime version: ${runtimeVersion ?? "unknown"}`);

  let path: string;
  try {
    path = await download(runtimeVersion, cacheDir);
  } catch (e) {
    console.warn(
      `[e2e] no msedgedriver for WebView2 ${runtimeVersion ?? "unknown"} (${String(e)}) — ` +
        `falling back to the version matching the installed Edge browser`,
    );
    path = await download(undefined, cacheDir);
  }

  // Log the driver's *own* reported version, not just the path — this is the
  // only way to confirm the pin above actually took effect rather than
  // silently resolving to whatever was already cached in e2e/.drivers/.
  let driverVersion = "unknown";
  try {
    driverVersion = execFileSync(path, ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch (e) {
    driverVersion = `could not query (${String(e)})`;
  }
  console.log(`[e2e] msedgedriver: ${path}`);
  console.log(`[e2e] msedgedriver version: ${driverVersion}`);
  return path;
}

/// Poll the DevTools endpoint until it answers, or give up.
async function waitForDebugPort(port: number, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "never attempted";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return (await res.text()).trim();
      lastError = `HTTP ${res.status}`;
    } catch (e) {
      lastError = String(e);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `the app never opened its DevTools port ${port} within ${timeoutMs}ms (last: ${lastError}). ` +
      `The build must come from the E2E overlay — ` +
      `pnpm tauri build --config src-tauri/tauri.e2e.conf.json`,
  );
}

/// Launch the app, then attach msedgedriver to it.
///
/// Why the app is launched here rather than by tauri-driver: tauri-driver
/// hands `--remote-debugging-port` to the app through the
/// `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` environment variable, and that
/// variable never reaches the browser process. wry sets
/// `ICoreWebView2EnvironmentOptions::AdditionalBrowserArguments`
/// unconditionally (`wry/src/webview2/mod.rs`, defaulting to
/// `--disable-features=msWebOOUI,…`), and the explicit option supersedes the
/// environment variable. The port therefore never opened, and every session
/// died with "DevToolsActivePort file doesn't exist" — a message that reads
/// like a driver-version mismatch and cost a month of chasing one.
///
/// So the flag is compiled in via `src-tauri/tauri.e2e.conf.json` instead, the
/// app is started directly, and the driver attaches to the already-open port.
async function startWindowsHarness(): Promise<void> {
  const msedgedriverPath = await resolveMsedgedriver();

  appProcess = spawn(appBinary, [], { stdio: ["ignore", "inherit", "inherit"] });
  appProcess.on("exit", (code) => {
    if (code !== 0 && code !== null) console.error(`[e2e] app exited early with code ${code}`);
  });

  const version = await waitForDebugPort(DEBUG_PORT, 60_000);
  console.log(`[e2e] DevTools endpoint up on ${DEBUG_PORT}: ${version}`);

  nativeDriver = spawn(msedgedriverPath, [`--port=${DRIVER_PORT}`], {
    stdio: ["ignore", "inherit", "inherit"],
  });
}

export const config: WebdriverIO.Config = {
  hostname: "127.0.0.1",
  port: DRIVER_PORT,
  path: "/",

  specs: ["./specs/**/*.test.ts"],
  maxInstances: 1,

  capabilities: [
    isWindows
      ? {
          browserName: "MicrosoftEdge",
          // Attach to the WebView2 instance the app already opened rather than
          // letting the driver spawn a browser of its own.
          "ms:edgeOptions": { debuggerAddress: `127.0.0.1:${DEBUG_PORT}` },
          // Keep WDIO v9 on classic WebDriver. Left to itself it negotiates
          // BiDi from the webSocketUrl in the session response, which lands on
          // msedgedriver's own BiDi endpoint and bypasses the attached target.
          "wdio:enforceWebDriverClassic": true,
        }
      : // `tauri:options` is tauri-driver's vendor extension. It is a valid W3C
        // vendor-prefixed capability but is not in WDIO's capability type, so
        // it needs an assertion the Windows branch above does not.
        ({
          browserName: "",
          "tauri:options": { application: appBinary },
          "wdio:enforceWebDriverClassic": true,
        } as WebdriverIO.Capabilities),
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

  async onPrepare() {
    // Must run before the app process starts: the store is read once at
    // hydration, so seeding after launch would be too late.
    seedFirstRunPreferences();

    if (isWindows) {
      await startWindowsHarness();
      return;
    }
    // Linux keeps tauri-driver: WebKitWebDriver has no equivalent of the
    // WebView2 argument problem, and tauri-driver launches the app for us.
    tauriDriver = spawn("tauri-driver", [], {
      stdio: [null, process.stdout, process.stderr],
    });
  },

  onComplete() {
    tauriDriver?.kill();
    nativeDriver?.kill();
    appProcess?.kill();
  },
};
