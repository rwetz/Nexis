// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The rainbow hover accent for the Nexis Default theme.
 *
 * This module owns *what* gets a rainbow and *which* rainbow; `globals.css`
 * owns only how one is painted. The split matters because the interesting part
 * of the effect cannot be expressed in CSS at all: a button is meant to show a
 * different one of the four gradients on **every** hover, and CSS has no way to
 * advance a counter on a pointer event. So a single delegated listener stamps
 * the choice onto the element as custom properties, and the stylesheet has one
 * rule that reads them.
 *
 * Keeping the *scope* here too is what makes the effect tunable. The first cut
 * of this lived entirely in CSS, matched every `hover:bg-accent` /
 * `hover:bg-muted` utility in the tree, and consequently fired on every list
 * row, tree item and menu entry in the app — roughly 200 call sites. Narrowing
 * that from a stylesheet means guessing at selectors; narrowing it from here is
 * two predicates you can read.
 *
 * ## What gets one
 * A button — `<button>`, `[role="button"]`, `[role="tab"]`, or a real link —
 * **and** one whose hover state is the neutral highlight (`hover:bg-accent` /
 * `hover:bg-muted` and friends). The second half is the important one: it
 * excludes the primary, destructive and link button variants, whose hover is
 * already their own colour and carries meaning a rainbow would erase. Rows,
 * menu items (`[role="menuitem"]`), options and tree items are excluded by the
 * first half — they are the bulk of what made the first version too much.
 *
 * ## Glyph or text
 * A control with an SVG paints the **glyph** — even when it also has a label.
 * A text-only control paints its **text**. Its ordinary neutral hover surface
 * always stays in place, which keeps the spectrum as a small signal rather
 * than turning every eligible button into a billboard.
 */

export type RainbowMode = "glyph" | "text" | null;

export type RainbowVariant = {
  /** CSS gradient angle, in degrees (0 = up, 90 = right). */
  angle: number;
  /** OKLCH hue the sweep starts from; the stops run this + 0…300. */
  hue: number;
};

/**
 * The four gradients, cycled in order. They differ in *both* sweep direction
 * and starting hue — varying only one of the two produces four gradients that
 * a viewer reads as the same gradient, which defeats the point of having four.
 */
export const RAINBOW_VARIANTS: readonly RainbowVariant[] = [
  { angle: 100, hue: 25 }, // warm-led, left to right
  { angle: 285, hue: 150 }, // green-led, right to left
  { angle: 20, hue: 265 }, // blue-led, bottom to top
  { angle: 200, hue: 60 }, // amber-led, top to bottom
];

/** Hue offsets of the seven stops. 300 rather than 360 so the two ends of the
 * sweep are different colours instead of meeting back at the start. */
export const RAINBOW_STOP_OFFSETS: readonly number[] = [0, 50, 100, 150, 200, 250, 300];

export const RAINBOW_GRADIENT_ID_PREFIX = "nexis-rainbow-";

/** Controls that can take a rainbow. Deliberately not "anything with a hover
 * utility" — see the module comment. */
const CANDIDATE = 'button,[role="button"],[role="tab"],a[href]';

/** The neutral-highlight hover utilities. A control whose hover is its own
 * colour (primary, destructive, link) matches none of these and is left be. */
const NEUTRAL_HOVER = /(?:^|\s)(?:hover|group-hover|focus):bg-(?:accent|muted)(?:\/\d{1,3})?(?=\s|$)/;

export function isRainbowTarget(el: Element): boolean {
  if (!el.matches(CANDIDATE)) return false;
  const cls = el.getAttribute("class");
  return cls !== null && NEUTRAL_HOVER.test(cls) && rainbowMode(el) !== null;
}

/**
 * A button's visible label, ignoring its icons and its screen-reader-only text.
 * `textContent` alone would call every icon button with an `sr-only` label a
 * labelled button, which is exactly backwards — those are the icon buttons.
 */
export function visibleLabel(el: Element): string {
  let out = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3 /* TEXT_NODE */) {
      out += node.textContent ?? "";
      continue;
    }
    if (!(node instanceof Element)) continue;
    if (node.classList.contains("sr-only")) continue;
    if (node.tagName.toLowerCase() === "svg") continue;
    out += visibleLabel(node);
  }
  return out.trim();
}

export function rainbowMode(el: Element): RainbowMode {
  if (el.querySelector("svg") !== null) return "glyph";
  return visibleLabel(el) === "" ? null : "text";
}

/** Stamp one variant onto an element. Exported for the test suite. */
export function applyRainbow(el: HTMLElement, index: number): void {
  const mode = rainbowMode(el);
  if (mode === null) return;
  const v = RAINBOW_VARIANTS[index % RAINBOW_VARIANTS.length];
  el.style.setProperty("--rainbow-angle", `${v.angle}deg`);
  el.style.setProperty("--rainbow-hue", String(v.hue));
  // The `currentColor` tail is SVG paint-fallback syntax: if the gradient defs
  // are not in the document the glyph keeps its normal colour instead of
  // vanishing, which is what a bare unresolvable `url()` would do.
  el.style.setProperty(
    "--rainbow-paint",
    `url(#${RAINBOW_GRADIENT_ID_PREFIX}${index % RAINBOW_VARIANTS.length}) currentColor`,
  );
  el.dataset.rainbow = mode;
}

export function clearRainbow(el: HTMLElement): void {
  el.style.removeProperty("--rainbow-angle");
  el.style.removeProperty("--rainbow-hue");
  el.style.removeProperty("--rainbow-paint");
  delete el.dataset.rainbow;
}

/**
 * Start cycling variants onto hovered controls. Returns the uninstaller, which
 * also strips every attribute this ever wrote — turning the setting off has to
 * leave the DOM as it found it, or the last-hovered button keeps its rainbow
 * until it re-renders.
 */
export function installRainbowAccent(doc: Document = document): () => void {
  let next = 0;
  let current: HTMLElement | null = null;

  const enter = (e: Event) => {
    const from = e.target;
    const el = from instanceof Element ? from.closest(CANDIDATE) : null;
    const target =
      el instanceof HTMLElement && isRainbowTarget(el) ? el : null;
    // `pointerover` bubbles from every descendant, so without this the variant
    // would advance once per child crossed rather than once per button entered.
    if (target === current) return;
    current = target;
    if (!target) return;
    applyRainbow(target, next);
    next = (next + 1) % RAINBOW_VARIANTS.length;
  };

  doc.addEventListener("pointerover", enter, true);
  doc.addEventListener("focusin", enter, true);

  return () => {
    doc.removeEventListener("pointerover", enter, true);
    doc.removeEventListener("focusin", enter, true);
    for (const el of Array.from(doc.querySelectorAll<HTMLElement>("[data-rainbow]"))) {
      clearRainbow(el);
    }
  };
}
