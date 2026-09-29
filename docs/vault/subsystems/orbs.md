---
type: subsystem
description: The AI's shader orbs — a WebGL2 port of shadercn's MIT engine design with 26 Nexis-owned shaders; the drive/renderer split, the uniform contract, the context budget, and the canvas-reuse trap.
---

# Orbs

Added 2026-09-29. An animated orb that stands for the AI: at rest in the AI window's new-chat card, and in the chat's working row, where it follows `agentMeta.status` (`modules/ai/lib/orbState.ts`: streaming is speaking; thinking and awaiting-approval are thinking; anything else is idle). It's chosen in Settings → AI → Orb (`settings/sections/OrbSection.tsx`), stored as the `aiOrbId` preference, and `"off"` keeps the logo and spinner. What shipped is in CHANGELOG `[Unreleased]`.

## Why it is built this way

- **The shaders are Nexis's own.** Every shadercn orb shader is a XorDev port, licensed non-commercial only, which Apache-2.0 can't carry (decided 2026-09-29). Only the MIT engine design was taken: the definition shapes in `types.ts`, and the easing in `drive.ts`, attributed in both headers. Don't paste a shadercn or XorDev shader into `variants/`.
- **WebGL2, not WebGPU.** shadercn's engine is WebGPU-only, and WebKitGTK has none. `ogl` is already the stack under `components/ui/backgrounds/`.

## Key files (`src/components/orbs/`)

- `types.ts`: the variant contract. Params are floats `p_<key>` with `min/max/default/integrate`; colours are `c_<key>` (`vec3`), with defaults of `#rrggbb` or `theme:--var|#fallback`.
- `drive.ts`: **pure**, no GL. It holds the springs, the volumes and the flow clock, and returns a uniform map. Everything that can be unit-tested is here (`drive.test.ts`).
- `renderer.ts`: ogl, a full-screen triangle, and `PRELUDE`, which declares `u_time u_anim u_inputVol u_outputVol u_res` and `out fragColor`, so a variant must not declare them itself. It renders **live orbs only**. `buildOrbMesh` and `applyFrame` are shared with the snapshot renderer.
- `snapshot.ts`: **every still frame**, meaning gallery tiles and reduced motion. One shared WebGL2 context renders them in a queue and hands back cached PNG data URLs. This is what keeps a 26-orb gallery under the context cap.
- `ShaderOrb.tsx` / `LazyShaderOrb.tsx`: the component, plus the lazy wrapper every caller uses.
- `variants/`: 26 shaders plus `glsl.ts` (shared noise, fbm, sphere, lighting and palette helpers). Each variant declares `themed`: whether its colours follow the theme. The picker's Theme chip reads that flag, and a test checks it against the colours the variant declares. `ids.ts` is the id list for startup-path code; `variants.test.ts` keeps the two in sync and checks statically that every uniform the drive writes is declared.

## Invariants / gotchas

- **One renderer, one fresh `<canvas>`.** `dispose` loses its WebGL context on purpose, to stay under the cap. A canvas keeps a single context for life, so a new renderer on the same element gets the dead one. `canvasKey` in `ShaderOrb` remounts the canvas for every renderer. Before that, selecting an orb in Settings (going from a still frame to a live one) dropped it straight to the fallback.
- **ogl writes inline sizes.** `new Renderer()` calls `setSize(300, 150)`, which sets `style.width/height`. The renderer restores the canvas's own inline size and sizes only the backing store afterwards, and it never calls `renderer.setSize`.
- **Context budget of about 16.** Past it, Chromium evicts the oldest context, which shows a sad-face icon. Stills go through `snapshot.ts`, never a context of their own; only the selected and hovered gallery tiles are live.
- **Shaders are written clean-room.** Twenty took their idea from shadcn labs' concept list (titles and one-line descriptions only). Adding more follows the same rule: read what a look is *called*, never how it is coded.
- **Test on a light theme.** A translucent or pale orb disappears on white. Every first draft of Nimbus, Lattice, Galaxy and Plasma did.
- **Losses are counted per orb, not per renderer.** One loss retries; a second shows the CSS fallback. A per-renderer count reset on every rebuild and could rebuild forever.
- **ogl ignores failures.** It falls back to WebGL1 silently and only warns on a compile error, so the renderer checks for WebGL2 and link status itself and rejects `ready`.
- **Import `useTheme` from `modules/theme/ThemeProvider`**, not from the index. Through the index, Rollup warns of a cross-chunk cycle.
- **Never `atan()` for angular noise.** Angle-based noise leaves a seam where the angle wraps at ±π. Sample by direction instead (see `rings.ts`).

## Debugging entry points

- An orb shows a flat gradient disc → the console for `[nexis] orb failed to start` (compile or link log), or two context losses.
- A sad-face icon on some canvases → too many live contexts.
- An orb draws at the wrong size → inline styles on the canvas (the ogl `setSize` trap).

## Related

[[theming]] · [[icon-and-motion-system]] · [[ai]]
