// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
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
          // Vite/Rollup helper virtual modules (preload helper, commonjs
          // interop). Left unassigned, Rollup colocates them in whichever
          // chunk references them first — which can be a lazy manual chunk,
          // silently forcing it into the startup preload set. Checked before
          // the node_modules guard because virtual ids have no path.
          if (id.includes("vite/preload-helper") || id.includes("commonjsHelpers"))
            return "ui-utils";

          if (!id.includes("node_modules")) return;

          // Ubiquitous tiny utils imported by nearly every component (cn()).
          // Same colocation hazard as above: without an explicit assignment,
          // tailwind-merge + clsx actually landed inside the lazy `streamdown`
          // chunk, making main statically import it and defeating its split.
          if (
            id.includes("/tailwind-merge/") ||
            id.includes("/clsx/") ||
            id.includes("/class-variance-authority/")
          )
            return "ui-utils";

          // ── AI provider SDKs ───────────────────────────────────────────────
          // Each provider in its own chunk — unused providers don't bloat the
          // initial load (they're lazy-imported in agent.ts).
          if (id.includes("@ai-sdk/anthropic")) return "ai-anthropic";
          if (id.includes("@ai-sdk/google")) return "ai-google";
          if (id.includes("@ai-sdk/openai-compatible")) return "ai-openai-compat";
          if (id.includes("@ai-sdk/openai")) return "ai-openai";
          if (id.includes("@ai-sdk/cerebras")) return "ai-cerebras";
          if (id.includes("@ai-sdk/groq")) return "ai-groq";
          if (id.includes("@ai-sdk/xai")) return "ai-xai";
          if (id.includes("@ai-sdk/")) return "ai-sdk-shared";

          // ── xterm ──────────────────────────────────────────────────────────
          // WebGL addon is optional (falls back to canvas) — keep it separate
          // so the main terminal chunk doesn't pull in the GPU pipeline upfront.
          if (id.includes("@xterm/addon-webgl")) return "xterm-webgl";
          if (id.includes("/xterm/") || id.includes("@xterm/")) return "xterm";

          // ── CodeMirror ─────────────────────────────────────────────────────
          // Strategy: statically-required editor infrastructure → codemirror-core
          //           (always loaded when any editor opens).
          //           Theme packages → codemirror-themes (lazy for users who
          //           never open a file, but practically always loaded quickly).
          //           Language packs (lang-javascript, lang-python, etc.) and
          //           legacy-modes are intentionally NOT named here.
          //           languageResolver.ts uses dynamic imports for them, so
          //           Rollup will create per-language lazy chunks automatically.
          //           Forcing them into a named chunk would defeat that laziness.
          const CODEMIRROR_CORE = new Set([
            "@codemirror/state",
            "@codemirror/view",
            "@codemirror/language",
            "@codemirror/commands",
            "@codemirror/lint",
            "@codemirror/autocomplete",
            "@codemirror/search",
            "@codemirror/merge",
          ]);
          const cmSegment = id.split("/node_modules/").pop() ?? "";
          const cmPkg = cmSegment.startsWith("@")
            ? cmSegment.split("/").slice(0, 2).join("/")
            : (cmSegment.split("/")[0] ?? "");
          if (CODEMIRROR_CORE.has(cmPkg)) {
            return "codemirror-core";
          }
          // react-codemirror wrapper + vim mode are always loaded with an editor
          if (id.includes("@uiw/react-codemirror")) return "codemirror-core";
          if (id.includes("@replit/codemirror-vim")) return "codemirror-core";
          // Themes are lazily loaded but group them to avoid many small files
          if (id.includes("@uiw/codemirror-theme") || id.includes("@uiw/codemirror-themes"))
            return "codemirror-themes";
          // lezer parsers that don't have their own lang- package
          if (id.includes("@lezer/")) return "codemirror-core";
          // Remaining @codemirror/* not in the core set are lang packs —
          // let Rollup split them as natural lazy chunks.

          // ── Markdown / content rendering ───────────────────────────────────
          if (
            id.includes("/streamdown/") ||
            id.includes("@streamdown/") ||
            id.includes("/remark-") ||
            id.includes("/rehype-") ||
            id.includes("/unified/") ||
            id.includes("/unist-") ||
            id.includes("/hast-") ||
            id.includes("/mdast-") ||
            id.includes("/vfile") ||
            id.includes("/remend/") ||
            id.includes("/micromark") ||
            id.includes("/decode-named-character-reference/") ||
            id.includes("/character-entities")
          )
            return "streamdown";

          // ── Animation / 3D ─────────────────────────────────────────────────
          if (id.includes("/motion/") || id.includes("framer-motion"))
            return "motion";
          if (id.includes("/ogl/")) return "ogl-bg";

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

          // ── Token counting ─────────────────────────────────────────────────
          // tokenlens is only used in the context indicator component which is
          // never in the critical path — isolate it so initial load skips it.
          if (id.includes("/tokenlens/") || id.includes("@tokenlens/"))
            return "tokenlens";
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
