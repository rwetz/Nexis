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
        "src/lib/path.ts",
        "src/lib/plugins/registry.ts",
        "src/modules/ai/lib/compact.ts",
        "src/modules/ai/lib/security.ts",
        "src/modules/ai/tools/shell.ts",
        "src/modules/terminal/lib/keymap.ts",
        "src/modules/terminal/lib/osc-handlers.ts",
        "src/modules/terminal/lib/pty-bridge.ts",
      ],
      thresholds: {
        lines: 40,
        branches: 35,
        functions: 45,
        statements: 40,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
