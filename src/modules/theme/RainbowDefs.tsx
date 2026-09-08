// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import {
  RAINBOW_GRADIENT_ID_PREFIX,
  RAINBOW_STOP_OFFSETS,
  RAINBOW_VARIANTS,
} from "./rainbowAccent";

/**
 * The four rainbows as SVG paint servers, so an icon *glyph* can be filled with
 * one. CSS gradients cannot paint an SVG path — `fill` takes a colour or a
 * `url()` reference — so the same four gradients exist twice: once as a
 * `linear-gradient()` in `globals.css` for button surfaces, and once here for
 * glyphs. The duplication is held to the direction and hue only; both read the
 * *same* `--accent-rainbow-*` tokens for lightness and chroma, so a change to
 * the palette moves both.
 *
 * Those tokens resolve here for the same reason the file-tree retint works: the
 * defs are inlined into the document, so the page's custom properties cascade
 * into them. Moving this into a `data:` URL or a standalone .svg would silently
 * render every gradient invalid — see CLAUDE.md pitfall #18.
 */
export function RainbowDefs() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      style={{ position: "absolute", pointerEvents: "none" }}
    >
      <defs>
        {RAINBOW_VARIANTS.map((v, i) => {
          // CSS gradient angles are measured from "up", clockwise; SVG's
          // objectBoundingBox has y growing downward. Hence (sin, -cos).
          const rad = (v.angle * Math.PI) / 180;
          const dx = Math.sin(rad);
          const dy = -Math.cos(rad);
          return (
            <linearGradient
              key={v.angle}
              id={`${RAINBOW_GRADIENT_ID_PREFIX}${i}`}
              gradientUnits="objectBoundingBox"
              x1={0.5 - dx / 2}
              y1={0.5 - dy / 2}
              x2={0.5 + dx / 2}
              y2={0.5 + dy / 2}
            >
              {RAINBOW_STOP_OFFSETS.map((offset, s) => (
                <stop
                  key={offset}
                  offset={s / (RAINBOW_STOP_OFFSETS.length - 1)}
                  stopColor={`oklch(var(--accent-rainbow-glyph-l) var(--accent-rainbow-c) ${
                    v.hue + offset
                  })`}
                />
              ))}
            </linearGradient>
          );
        })}
      </defs>
    </svg>
  );
}
