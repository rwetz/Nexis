---
type: subsystem
description: The Art pack's SVG playground — icon-scale preview, the in-house optimizer and why it is not SVGO, and why the preview renders a sanitized copy.
---

# Art pack

One panel so far, added 2026-09-03: the SVG playground, under the `art` pack (view `svg-playground`). Sidebar host stacks the preview under the code; the expand button detaches it into an `svg-playground` tab that lays out side by side — the same pattern as the ML Lab's network diagram (see [[ml-lab]]), including carrying the collapse control back on the tab.

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

## Not built yet

The shape generator and the animator from the roadmap. The animator is explicitly gated on the first two earning it — a keyframe timeline is a genuinely large surface.

Related: [[icon-and-motion-system]], [[editor]], [[expansion-packs]].
