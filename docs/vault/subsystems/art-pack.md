---
type: subsystem
description: The Art pack's SVG playground — its four panes, the direct-manipulation canvas and its three coordinate spaces, the in-house optimizer and why it is not SVGO, and why every preview renders a sanitized copy.
---

# Art pack

One panel so far, added 2026-09-03: the SVG playground, under the `art` pack (view `svg-playground`). Sidebar host stacks the preview under the code; the expand button detaches it into an `svg-playground` tab that lays out side by side — the same pattern as the ML Lab's network diagram (see [[ml-lab]]), including carrying the collapse control back on the tab.

The left half is **four tabs over one document**: Source (CodeMirror), Canvas (direct manipulation), Shapes (parametric generators) and Presets (ready-made art). They are tabs, not modes — every pane reads and writes the same `source` string, so a shape can be generated, dragged on the canvas and then hand-tuned in code without any pane owning a copy. The right half (preview, optimize, export) is shared by all four.

The tab holds **no document of its own**. The source lives in the playground's own `localStorage` key, so panel and tab are two views of one thing and closing the tab loses nothing.

## Why the preview looks like that

The itch is that browser-based SVG editors are bad at icon-scale art, and the preview is why: showing a mark at 300px answers none of the questions you have about it. So the same source renders at **16, 24, 32 and 64px at once**, over a pixel grid with centre guides. The question being answered is "does this 1.5-unit stroke land on a pixel boundary at 16px", and it is answerable by looking.

The editor is CodeMirror, so **CLAUDE.md pitfall #15 applies**: the `.zoom-content .cm-editor` exemption in `globals.css` is what keeps clicks landing on the right line under app zoom. It is inherited by being an ordinary `.cm-editor` — do not wrap this in anything that re-introduces a CSS `zoom`.

## The optimizer is deliberately not SVGO

`lib/svgOptimize.ts`. The roadmap named SVGO; it was not used, and the reasoning is recorded here so it is not re-argued:

- SVGO plus `css-select`/`css-tree` is a large dependency for one panel.
- What this panel needs is the icon-scale subset — editor cruft, whitespace, coordinate precision, hex colours — which is a bounded problem with a testable answer.

**What it will not do:** no path-data rewriting, no transform collapsing, no element unwrapping, no style-to-attribute conversion. Those are where SVGO earns its size and where a naive implementation silently corrupts art. Every transform in there is one a human could do by hand and verify by eye.

It is **idempotent**, and there is a test for that — otherwise the byte saving it reports would be a function of how many times you pressed the button.

Swapping SVGO back in later is a change to `optimizeSvg` alone.

## The preview renders a sanitized copy

`lib/svgSanitize.ts`. This is a real guard, not a formality.

SVG is not an inert image format: it carries `<script>`, event-handler attributes, `javascript:` URLs and `<foreignObject>` (a hole straight through to arbitrary HTML). The preview **must** inline its markup, because `currentColor` and `var(--…)` do not resolve inside a `data:` URL — the same constraint that forces the file-tree art inline (pitfall #18, from the other direction). So that markup lands in a Tauri webview with `window.__TAURI__` in scope.

"The user pasted it themselves" is not a security model when the whole point of a playground is pasting art found elsewhere.

The detail that matters most: **URL attributes are judged on the normalized value** — entities decoded, whitespace stripped — never on the raw text. A tab inside the scheme gives a live URL containing no literal `javascript:` for a substring check to find, and a test for exactly that case caught the first implementation. `<set attributeName="onload">`, which re-adds a handler at runtime after a naive pass has finished, is stripped too.

The editor and every export keep the **original**; only the preview is sanitized, and the panel says what it withheld rather than silently showing different art.

## The canvas

`SvgCanvas.tsx` plus `lib/svgDoc.ts` and `lib/pathData.ts`. Select, move, drag points, scale, nudge, delete.

**The indirection through `data-nx-id` is load-bearing and must not be "simplified".** The preview renders a *sanitized* copy (see below), so a click lands on a node in the sanitized render rather than in the user's document. `parseSvgSource` tags every element `data-nx-id` in document order before serializing for the preview; that id is what maps a hit back to the node to mutate, and `serializeSvg` strips it on the way out so it never reaches the user's source. Rendering the raw source to make selection easier would trade the pack's whole security posture for a saved lookup.

**Formatting survives** because the document is parsed with `DOMParser` and every mutation writes an attribute rather than restructuring the tree — `XMLSerializer` hands back the same whitespace text nodes it was given. The one normalization is `<rect />` to `<rect/>`, and it is only paid once something is actually edited.

### The three coordinate spaces

Mixing these produces a drag that drifts, which is the failure mode to recognise:

| Space | What lives there | How to get there |
| --- | --- | --- |
| Client pixels | pointer events | — |
| Element's own user space | `x`, `cx`, `d`, `points` | `el.getScreenCTM().inverse()` |
| Parent's space | the element's own `transform` | `el.parentElement.getScreenCTM().inverse()` |

- A **move** measures its delta in the *parent's* frame. The element's own would double-count its transform every frame.
- A **scale** freezes the screen matrix at pointerdown, because writing a transform changes the live matrix and reading it back feeds the scale into its own input. It also re-derives from the pointerdown source each move rather than compounding: twenty frames of 1.1x is not 2x, and a compounding drag can never be dragged back to its start.
- Primitives move by rewriting **their own geometry**, not by accumulating a transform. Only groups, `<use>` and text fall back to one, and it merges into any existing translate — without the merge a drag appends one per pointer move.

`pointer-events: all` on the rendered shapes is what makes unfilled icon art selectable at all; with the default only the stroke is a hit target.

### The overlay is not drawn in pixels

The selection box and the handles go into a **second `<svg>` that mirrors the art's `viewBox` and `preserveAspectRatio`, in the same box**, so its user units *are* the art's user units and the browser does the mapping. Positions come from the matrix ratio `rootCTM.inverse() * nodeCTM`, in which any factor the two share — ancestor zoom, device pixel ratio, the viewBox fit — cancels.

The first version computed container-relative **client pixels** and drew them into the overlay's local space. Those are the same thing only when nothing between them applies a scale, and this app applies one: `zoom: var(--app-zoom)` on `.zoom-content`. The box and every handle sat offset from the shape and mis-scaled by the zoom factor, and grabbing a handle made its point jump to the cursor.

The viewport is therefore also **`zoom-exempt`**, like the terminal, the REPL and every CodeMirror instance (pitfall #15): net scale 1.0 means `getScreenCTM`, `clientWidth` and a pointer's `clientX` are all in one space. Strokes use `vector-effect="non-scaling-stroke"` and handle radii are multiplied by `unitsPerPx` (derived from the overlay's own `clientWidth` and viewBox, both local values), so a handle is a constant on-screen size in a viewBox of any scale.

Both halves are pinned by `pitfall 15 (canvas)` in `src/lib/pitfall-guards.test.ts`, which also fails if `getBoundingClientRect` reappears in the file.

### The path parser

`lib/pathData.ts` normalizes to absolute `M L C Q A Z`, expanding `H`/`V` and reflecting `S`/`T`. A handle whose position depends on the segments before it cannot be dragged independently, which is the whole reason for the normalization. Two things it exists to get right:

- **Arc flags are read one character at a time.** `a5 5 0 011 1` is a valid, commonly emitted spelling of two flags plus a coordinate; a generic number scanner reads `011` and produces a silently corrupt arc.
- **A half-typed path returns what it understood** rather than throwing. Live editing means truncated input is the normal case, not an error.

The cost, stated honestly: a re-serialized path is longer than a tight relative one. The optimizer wins that back, and a path is only rewritten when something is actually dragged.

## Presets

`lib/presets.ts` plus `PresetGallery.tsx`, in a **Presets** tab. 27 documents in four groups (Marks, Shapes, Patterns, Dividers). A blank document is the worst starting point a drawing tool can offer.

Half are hand-authored on the 24-unit grid with a 1.5 stroke — the geometry the 16/24/32/64 preview row exists to judge. Half are **generator output frozen at a parameter set**, so a preset over a generator is a name and four numbers rather than a second copy of the geometry, and improving a generator improves its presets. Unstated parameters fall back to the generator's defaults, so adding a slider later does not break the presets over it.

Picking one replaces the editor and lands on the canvas. **No preset is a special case** — it is a string in the editor, and nothing records where a document came from.

A test asserts every preset names `currentColor` and no literal hex: art with a baked-in colour cannot take the theme (pitfall #18's file-tree defect, same shape).

## Shape generator

`lib/shapes.ts` plus `ShapeGenerator.tsx`, in a **Shapes** tab. Fourteen generators: blob, wave, filled wave, arc, divider, grain, star, polygon, gear, spiral, rings, dot grid, burst, chevrons.

Each is a **pure function from numbers to a complete SVG document**. That is the load-bearing property: the output goes into the editor, where optimize/preview/export already work, so no generator owns any of those.

Two decisions not to undo:

- **Seeds are parameters, never `Math.random()`.** Otherwise the preview disagrees with the export, the shape jumps on re-render, and moving any slider rerolls the form so you cannot converge on one you liked.
- **Insert is a button, not live-writing.** Live-writing destroys hand-written source the instant a control is touched, with no undo across the boundary.

Grain is the odd one: raw `feTurbulence` is opaque RGB static that ignores fill, so it is turned into an alpha mask (`feColorMatrix`) and composited against a `currentColor` rect. Without that it would be the only generator that cannot take the theme.

Three traps the radial generators share, each already paid for once:

- **Angles are measured from twelve o'clock**, in one shared `polar` helper. SVG's own zero is three o'clock, which is right for maths and wrong for a control — nobody dialling "Rotation" on a star expects zero to mean "one point aimed right".
- **The polygon's corner rounding clamps its cut-back to half the shorter edge.** Without the clamp, a large radius on a triangle overshoots the edge and turns the shape inside out.
- **The gear punches its bore with `fill-rule="evenodd"`**, not with a background-coloured circle on top. It stays one path, and it works on any background rather than only the one it was drawn against.

## Not built yet

The animator — a keyframe timeline over SMIL / CSS / Web Animations. Explicitly gated on the rest earning it, because a timeline UI is a genuinely large surface.

Also open: the pack still owns exactly one view. A preset that exists to be a design surface wants more behind it than one panel, and what else belongs is a decision to make before building any of it.

Related: [[icon-and-motion-system]], [[editor]], [[expansion-packs]].
