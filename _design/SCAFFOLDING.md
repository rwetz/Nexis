# Scaffolding a New Tauri + React App from the Nexis Blueprint

> Step-by-step to stand up a fresh desktop app with the full Nexis design system.
> Assumes `pnpm`, Rust toolchain, and Node ≥ 20 installed. Nexis is the reference
> implementation; this guide reproduces its *design foundation* (not its
> features).

Placeholders to replace throughout: **`myapp`** (kebab id), **`My App`** (display
name), **`app.myorg.myapp`** (reverse-DNS identifier).

> ⚠ **Keep [PITFALLS.md](PITFALLS.md) open while following this guide.** Steps
> marked with ⚠ have known real-world traps that the templates don't cover
> (Linux borderless chrome, NVIDIA/WebKitGTK rendering, View Transitions,
> resize cursors, pnpm build scripts).

---

## Step 0 — Prerequisites

```bash
# Rust (if not already):  https://rustup.rs
rustup update stable
# Tauri CLI + node deps use pnpm
corepack enable && corepack prepare pnpm@latest --activate
```

---

## Step 1 — Create the Tauri + React (Vite/TS) project

```bash
pnpm create tauri-app@latest myapp --template react-ts --manager pnpm
cd myapp
```

This gives you `src/` (React) + `src-tauri/` (Rust) + `vite.config.ts`.

---

## Step 2 — Install the design-system dependencies

```bash
# Tailwind v4 (CSS-first) + shadcn tooling
pnpm add -D tailwindcss @tailwindcss/vite tw-animate-css shadcn
# Core UI + utilities
pnpm add radix-ui class-variance-authority clsx tailwind-merge
# Icons, motion, WebGL backgrounds, toasts, state
pnpm add @hugeicons/react @hugeicons/core-free-icons motion ogl sonner zustand
# Self-hosted fonts
pnpm add @fontsource-variable/inter @fontsource/jetbrains-mono
# Tauri plugins used by the chrome/theme layer
pnpm add @tauri-apps/api @tauri-apps/plugin-os @tauri-apps/plugin-store @tauri-apps/plugin-window-state
```

> The full Nexis `package.json` (in the repo) additionally pulls CodeMirror,
> xterm, AI SDKs, etc. — those are **feature** deps, not design deps. Add only
> what your app needs.

> ⚠ pnpm ≥ 11 refuses to run esbuild's postinstall until you approve it in
> `pnpm-workspace.yaml` (`allowBuilds: { esbuild: true }`) — the old
> `package.json » pnpm.onlyBuiltDependencies` field is ignored. See
> PITFALLS.md §6.

---

## Step 3 — Drop in the design files

From this blueprint's `templates/` folder, copy into your new app:

| Blueprint file | Copy to | Purpose |
|---|---|---|
| `frontend/styles/globals.css` | `src/styles/globals.css` | **generic** design-system CSS (default — any app) |
| `frontend/styles/globals.ide.css` | `src/styles/globals.css` | full version *instead* — only if you embed a terminal/code editor |
| `frontend/styles/fonts.css` | `src/styles/fonts.css` | Inter `@font-face` (subsetted) |
| `frontend/styles/code-highlight.css` | `src/styles/code-highlight.css` | (only if you render code) |
| `frontend/styles/tokens.ts` | `src/styles/tokens.ts` | runtime OKLCH→rgb resolver |
| `frontend/lib/utils.ts` | `src/lib/utils.ts` | `cn()` |
| `frontend/lib/platform.ts` | `src/lib/platform.ts` | platform + `USE_CUSTOM_WINDOW_CONTROLS` |
| `frontend/lib/motion.ts` | `src/lib/motion.ts` | motion vocabulary |
| `frontend/lib/fonts.ts` | `src/lib/fonts.ts` | Nerd-font detection (only if you have a terminal) |
| `frontend/theme/*` | `src/modules/theme/*` | theme engine (see Step 7) |
| `frontend/components/WindowControls.tsx` | `src/components/WindowControls.tsx` | min/max/close |
| `config/vite.config.ts` | `vite.config.ts` | React + Tailwind plugins, `@` alias, chunking |
| `config/components.json` | `components.json` | shadcn config |
| `config/index.html` | `index.html` | anti-flash theme bootstrap (rename title) |
| `config/main.tsx` | `src/main.tsx` | font imports + hidden-window startup |
| `../assets/cursors/` | `public/cursors/` | **the whole cursor set** |
| `../assets/logo.png` | `public/logo.png` | brand logo (512×512) |
| `../assets/AppLogo.tsx` | `src/components/AppLogo.tsx` | inline SVG logo (recolor via `currentColor`) |

> Note: `components.json` points `tailwind.css` at `src/App.css`; Nexis actually
> imports `src/styles/globals.css` from `main.tsx`. Keep the `main.tsx` import as
> the source of truth and treat the `components.json` path as a shadcn CLI hint.

**Two CSS variants ship in the blueprint:**
- `globals.css` — **generic**, for any Tauri app. Already stripped of the
  xterm.js overrides, CodeMirror/LSP/debugger `.cm-*` rules, Lezer syntax colors,
  and the terminal ANSI palette. This is the default; copy it as
  `src/styles/globals.css`.
- `globals.ide.css` — the **full** version (adds all of the above back). Use this
  *instead* only if your app embeds a terminal or code editor.

Either way, the *design core* is identical and always present: the `@theme
inline` block, `:root`/`.dark` OKLCH tokens, `--brand` + its primitives
(`.brand-glow`, `.pane-focus-ring`, `.aurora-border`), the
`data-chrome="borderless"` chrome rules, the cursor block, scrollbar handling,
app-zoom, collapsible animation, and the View-Transition crossfade.

> The generic `globals.css` drops `@import "./code-highlight.css"`, so you don't
> need that file unless you switch to `globals.ide.css`.

---

## Step 4 — Wire Vite

`config/vite.config.ts` already includes `react()`, `tailwindcss()`, the `@ →
./src` alias, and the Tauri dev-server settings (port `1420`, `strictPort`,
`clearScreen:false`, ignore `src-tauri/**`). The `manualChunks` function is
Nexis-specific (splits AI SDKs/xterm/CodeMirror) — **delete the chunks for libs
you don't use**; keep the `react` / `radix` / `motion` / `ogl-bg` splits.

---

## Step 5 — Configure Tauri window & chrome

Merge `config/tauri.conf.json` into your `src-tauri/tauri.conf.json`, changing
`productName`, `version`, `identifier`, and the descriptions. The design-critical
bits:

```jsonc
"app": {
  "windows": [{
    "title": "My App",
    "width": 800, "height": 600, "minWidth": 420, "minHeight": 280,
    "titleBarStyle": "Overlay",   // macOS overlay traffic lights
    "hiddenTitle": true,
    "visible": false              // start hidden → no pre-paint flash
  }],
  "security": { "csp": "…" }       // copy the CSP; loosen connect-src per app
}
```

Add `config/tauri.windows.conf.json` as `src-tauri/tauri.windows.conf.json`
(Windows-only override: `decorations:false, transparent:true, shadow:false`).
Tauri auto-merges `tauri.<platform>.conf.json`.

> ⚠ **Also create `src-tauri/tauri.linux.conf.json` with the same override**
> (plus the width/height/min fields — the platform `windows` array *replaces*
> the base one, no per-field merge). Without it, Linux keeps native
> decorations while `platform.ts` still renders custom controls → double
> chrome, no rounded corners. See PITFALLS.md §1.

For **transparency on Linux/Windows** you also need it enabled in Rust — in
`src-tauri/tauri.conf.json` the window is transparent via the platform override;
ensure `tauri-build` features allow it (Tauri v2 handles transparent windows
without an extra Cargo feature, but Linux needs a compositor).

> ⚠ **NVIDIA + Wayland**: WebKitGTK's DMA-BUF renderer crashes the app at
> first paint (`Gdk Error 71`), and the common
> `WEBKIT_DISABLE_DMABUF_RENDERER=1` workaround silently breaks window alpha
> (black rectangle behind the rounded corners). The only verified
> stable-and-transparent fix is forcing Mesa's EGL for the process when an
> NVIDIA driver is detected — copy the `run()` snippet from PITFALLS.md §2
> into `lib.rs` of every new app.

> ⚠ Run `pnpm tauri icon` and `mkdir dist` **before** the first `cargo check`
> — `generate_context!` errors out if `bundle.icon` files or `frontendDist`
> don't exist. And delete the template's `installerHooks` line (Nexis-only
> file). See PITFALLS.md §7.

Copy `config/capabilities.default.json` → `src-tauri/capabilities/default.json`
and prune permissions to what you use. The chrome needs at minimum:
`core:window:allow-start-dragging`, `allow-minimize`, `allow-toggle-maximize`,
`allow-is-maximized`, `allow-close`, `allow-show`, `allow-set-focus`, plus
`os:default` and `store:default`.

Register the plugins in `src-tauri/src/lib.rs`:

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_os::init())
    .plugin(tauri_plugin_store::Builder::default().build())
    .plugin(tauri_plugin_window_state::Builder::default().build())
    // …your commands…
```
(and add the matching crates to `src-tauri/Cargo.toml`).

---

## Step 6 — App icons

Generate the full icon set (macOS `.icns`, Windows `.ico`, PNGs, mobile) from a
single source with Tauri's built-in generator:

```bash
pnpm tauri icon assets/logo.png        # writes src-tauri/icons/*
```

Point `bundle.icon` in `tauri.conf.json` at the generated files (the template
already lists the standard five). For the Windows NSIS installer header, use
`assets/icons/installer-logo.png`.

---

## Step 7 — Theme engine

Copy `frontend/theme/*` into `src/modules/theme/`. It has a `store` dependency
Nexis provides (`@/modules/settings/store` for persisted prefs +
`customThemes.ts` for disk-loaded themes). Two options:

- **Minimal**: strip `ThemeProvider` down to mode (`light|dark|system`) +
  `themeId`, persisting to `localStorage` only (drop the Tauri-store hydration
  and `customThemes`). The View-Transition crossfade and `applyTheme` stay
  as-is.

> ⚠ Add `IS_LINUX` to `withViewTransition`'s early-out: WebKitGTK (≤2.52)
> exposes `startViewTransition` but crashes or blanks the web process on the
> full-window theme snapshot ("app crashes when I change theme"). Linux gets a
> hard cut until webkit fixes it. See PITFALLS.md §3.
- **Full**: port `modules/settings/store.ts` + `customThemes.ts` from Nexis for
  disk-persisted prefs and user themes.

Add themes by copying `frontend/theme/example-theme.ts` (Tokyo Night), tweaking
the OKLCH values, and registering it in a `themes/index.ts` array (mirror Nexis).

---

## Step 8 — Compose the root

In `src/app/App.tsx` (create `src/app/`), mirror the Nexis provider stack:

```tsx
import { MotionConfig } from "motion/react";
import { ThemeProvider } from "@/modules/theme/ThemeProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export default function App() {
  return (
    <ThemeProvider>                                   {/* renders <SurfaceLayer/> */}
      <MotionConfig reducedMotion="user" transition={{ duration: 0.2 }}>
        <TooltipProvider>
          <div className="flex h-full flex-col">
            <header data-tauri-drag-region
              className="flex h-10 items-center gap-2 border-b border-border/60 bg-card select-none">
              {/* left: <AppLogo className="size-5" /> + title/tabs */}
              <div data-tauri-drag-region className="flex-1" />
              <WindowControls />
            </header>
            <main className="zoom-content flex-1 min-h-0">
              {/* your content */}
            </main>
          </div>
          <Toaster />
        </TooltipProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
```

`SurfaceLayer.tsx` from Nexis pulls in the WebGL backgrounds + a preferences
store; port it only if you want animated/image backgrounds. Otherwise
`ThemeProvider` can render nothing behind children.

> ⚠ Borderless windows show **no resize cursors** on the edges (the webview
> owns every pixel). Add a `ResizeHandles` overlay — 8 invisible strips with
> the `.cursor-*-resize` utilities + `startResizeDragging`, and the
> `core:window:allow-start-resize-dragging` permission (missing from the
> capability template). Reference implementation + details: PITFALLS.md §4.
> Also note the stock `AppLogo` marks are white-on-`currentColor` and vanish
> in dark mode — new apps should draw marks in `var(--background)`
> (PITFALLS.md §5).

---

## Step 9 — Add shadcn components as needed

```bash
pnpm dlx shadcn@latest add button dialog dropdown-menu tooltip sonner scroll-area
```

They'll land in `src/components/ui/` matching the `radix-luma` style and the CVA
conventions. `button.tsx` in the Nexis repo is the reference for how variants
should look (see DESIGN_SYSTEM.md §8).

---

## Step 10 — Run it

```bash
pnpm tauri dev      # dev with HMR
pnpm tauri build    # produce installers/bundles
```

You should see: a borderless rounded window (Win/Linux) / native traffic-light
window (macOS), no startup flash, the custom cursors, Inter UI type, and a
working light/dark toggle that crossfades.

---

## Reference project layout (Nexis)

```
myapp/
├─ index.html                  # anti-flash theme bootstrap
├─ vite.config.ts              # react + tailwind, @ alias, chunks
├─ components.json             # shadcn config
├─ package.json
├─ public/
│  ├─ logo.png
│  └─ cursors/                 # the bespoke cursor set + hotspots.json
├─ src/
│  ├─ main.tsx                 # font imports, hidden-window startup
│  ├─ app/App.tsx              # provider stack + shell
│  ├─ components/
│  │  ├─ ui/                   # shadcn components (CVA)
│  │  ├─ WindowControls.tsx
│  │  └─ AppLogo.tsx
│  ├─ lib/                     # utils, platform, motion, fonts
│  ├─ modules/theme/           # theme engine (types, applyTheme, provider, themes/)
│  └─ styles/                  # globals.css, fonts.css, tokens.ts, code-highlight.css
└─ src-tauri/
   ├─ tauri.conf.json          # window (overlay title, hidden, transparent-override)
   ├─ tauri.windows.conf.json  # decorations:false, transparent:true
   ├─ capabilities/default.json
   ├─ icons/                   # generated by `tauri icon`
   └─ src/lib.rs               # register os/store/window-state plugins
```

Nexis itself organizes features as `src/modules/<feature>/` (each with its own
components + Zustand store + `index.ts` barrel) and shared `src/plugins/` — a
clean pattern to copy for anything non-trivial.

---

## Design "definition of done" for a new app

- [ ] Light/dark toggle crossfades (View Transitions) on macOS/Windows — hard
      cut on Linux — and **does not crash**; no flash on launch.
- [ ] Borderless rounded window on Win/Linux; native on macOS; drag works.
- [ ] Corners are actually **transparent** (no black rectangle behind the
      12px radius) — check on NVIDIA/Wayland specifically.
- [ ] Window edges show resize cursors and drag-resize (ResizeHandles overlay).
- [ ] Custom cursors visible (arrow, pointer on buttons, resize on splitters).
- [ ] Inter loads for UI; JetBrains Mono for any mono text.
- [ ] `--brand` coral shows on the primary CTA / active state only.
- [ ] `pnpm tauri build` produces a bundle with correct icons + identifier.
- [ ] Reduced-motion OS setting disables animations.
