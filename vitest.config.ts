// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // keymap.test.mjs was the original Node-native-test version of the keymap
    // tests. It has been replaced by keymap.test.ts (proper Vitest syntax).
    // Exclude it so Vitest doesn't try to run the Node test module and report
    // a missing test suite.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      // Legacy Node-native-test file replaced by keymap.test.ts
      "src/modules/terminal/lib/keymap.test.mjs",
      // WDIO E2E specs — run with `pnpm test:e2e`, not Vitest
      "e2e/**",
      // Agent worktrees. The Claude Code harness checks out a full second copy
      // of the repo under here when a background task runs, and Vitest happily
      // collects both — so a local run reports doubled counts, and any spec
      // that reads a fixture by relative path fails in the copy. Excluding the
      // directory is the fix; the worktree has its own checkout to test in.
      ".claude/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "coverage",
      // Only measure coverage for files that have dedicated test suites.
      // Tauri-heavy modules (most of src/) import native IPC and can't be
      // loaded in the Node test environment without full mocking; including them
      // would show misleading 0% numbers.
      include: [
        "src/lib/externalTools.ts",
        "src/lib/missingTools.ts",
        "src/lib/path.ts",
        "src/lib/plugins/registry.ts",
        "src/modules/ai/lib/compact.ts",
        "src/modules/ai/lib/redact.ts",
        "src/modules/ai/lib/security.ts",
        "src/modules/ai/tools/plugin-tools.ts",
        "src/modules/ai/tools/shell.ts",
        "src/modules/command-history/lib/analysis.ts",
        "src/modules/sidebar/pluginPanels.ts",
        "src/modules/source-control/lib/secretScan.ts",
        "src/modules/sysmon/braille.ts",
        "src/modules/tabs/lib/mru.ts",
        "src/modules/tabs/lib/tabPersistence.ts",
        "src/modules/terminal/lib/ledger.ts",
        "src/modules/terminal/lib/ledgerRetention.ts",
        "src/modules/terminal/lib/sessionRestore.ts",
        "src/modules/terminal/lib/keymap.ts",
        "src/modules/terminal/lib/osc-handlers.ts",
        "src/modules/terminal/lib/pty-bridge.ts",
        // First component under coverage. Loadable because the jsdom harness in
        // src/test/ stubs the Tauri IPC transport rather than each API module,
        // so the sections' real imports resolve — the note above about
        // Tauri-heavy modules no longer applies to components tested that way.
        "src/settings/SettingsDialog.tsx",
      ],
      // Minimum-coverage gate (IDEAS D4): floors sit a few points below the
      // current numbers (lines/statements ~88%, branches ~89%, functions ~78%)
      // so ordinary churn doesn't flake the build, but a real regression that
      // drops coverage fails `pnpm test:coverage` — which CI now runs.
      // Ratchet these up as coverage improves; never lower them to make CI pass.
      thresholds: {
        lines: 86,
        branches: 87,
        functions: 76,
        statements: 86,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
