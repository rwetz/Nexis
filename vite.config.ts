// ╔══════════════════════════════════════╗
// ║  Imagine                             ║
// ║  Nexis-family Tauri app              ║
// ╚══════════════════════════════════════╝

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  esbuild: {
    drop: mode === "production" ? (["debugger"] as ["debugger"]) : [],
    pure:
      mode === "production"
        ? ["console.debug", "console.info", "console.trace"]
        : [],
  },
  build: {
    target:
      process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome120" : "es2022",
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
      },
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;

          // ── Animation ──────────────────────────────────────────────────────
          if (id.includes("/motion/") || id.includes("framer-motion"))
            return "motion";

          // ── React core ─────────────────────────────────────────────────────
          if (
            id.includes("/react-dom/") ||
            id.includes("/react/") ||
            id.includes("/scheduler/")
          )
            return "react";

          // ── UI primitives ──────────────────────────────────────────────────
          if (id.includes("@radix-ui/") || id.includes("/radix-ui/"))
            return "radix";
        },
      },
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
