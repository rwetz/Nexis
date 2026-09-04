// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Keyframe animation, emitted as SMIL or as CSS.
 *
 * The roadmap held this back until the rest of the pack earned it, and the
 * reason it is tractable now is that the hard parts were solved elsewhere: the
 * canvas already maps a click to a node in the user's document (`svgDoc.ts`),
 * so a track can *address* an element without this module inventing a second
 * selection model.
 *
 * ## Why both SMIL and CSS, and why SMIL is the default
 *
 * They fail in opposite directions and neither is a superset:
 *
 * - **SMIL** (`<animate>`) travels *inside the file*. An `<img src="x.svg">`
 *   and a `background-image` both animate, which is the whole point of an
 *   animated SVG asset. It cannot be driven by a stylesheet, and Chromium once
 *   intended to remove it (that deprecation was withdrawn in 2016 and SMIL is
 *   supported everywhere today, which is worth stating because the folklore
 *   outlived the fact).
 * - **CSS** animates only when the SVG is *inline in the page*, where it is
 *   also the only one a stylesheet, a media query, or `prefers-reduced-motion`
 *   can reach.
 *
 * SMIL is the default because the pack's output is a *file*, and a file whose
 * animation only works when pasted into a document is not an animated file.
 *
 * ## Timing is a fraction, never a millisecond
 *
 * A keyframe stores its position as 0..1 of the timeline, so changing the
 * duration does not require rewriting every key — which is the edit people
 * actually make, over and over, while they are dialling a motion in.
 */

import { n } from "./generative";

/** What a track can drive. Deliberately small: these cover almost all of it. */
export const ANIMATABLE = [
  "opacity",
  "translate-x",
  "translate-y",
  "scale",
  "rotate",
  "fill",
  "stroke",
  "stroke-dashoffset",
] as const;

export type Animatable = (typeof ANIMATABLE)[number];

export const ANIMATABLE_LABELS: Record<Animatable, string> = {
  "opacity": "Opacity",
  "translate-x": "Move X",
  "translate-y": "Move Y",
  "scale": "Scale",
  "rotate": "Rotate",
  "fill": "Fill",
  "stroke": "Stroke",
  "stroke-dashoffset": "Dash offset",
};

/** Properties driven by `transform`, which SMIL animates differently. */
const TRANSFORMS: Partial<Record<Animatable, "translate" | "scale" | "rotate">> = {
  "translate-x": "translate",
  "translate-y": "translate",
  "scale": "scale",
  "rotate": "rotate",
};

export function isTransform(property: Animatable): boolean {
  return property in TRANSFORMS;
}

/** Colour properties take a colour value; the rest take a number. */
export function isColor(property: Animatable): boolean {
  return property === "fill" || property === "stroke";
}

export type Keyframe = {
  /** Position on the timeline, 0..1. Never a duration — see the module note. */
  at: number;
  /** A number, or a colour string for `fill`/`stroke`. */
  value: number | string;
};

export type Track = {
  id: string;
  /** `data-nx-id` of the element this drives, or null for the whole document. */
  target: number | null;
  property: Animatable;
  keys: Keyframe[];
};

export type Timeline = {
  /** Whole-timeline length in seconds. */
  duration: number;
  repeat: boolean;
  tracks: Track[];
};

export const DEFAULT_TIMELINE: Timeline = {
  duration: 2,
  repeat: true,
  tracks: [],
};

/**
 * Sort by position and drop keys outside the timeline.
 *
 * SMIL requires `keyTimes` to be ascending and to start at 0 and end at 1; an
 * out-of-order list is not a smaller animation, it is markup the renderer
 * rejects outright, so this is a correctness step and not a tidy-up.
 */
export function normalizeKeys(keys: readonly Keyframe[]): Keyframe[] {
  const inside = keys
    .filter((k) => k.at >= 0 && k.at <= 1)
    .slice()
    .sort((a, b) => a.at - b.at);
  if (inside.length === 0) return [];

  // Pin the ends. Without a key at 0 and 1, keyTimes and values disagree in
  // length and the whole element is ignored.
  const out = inside.slice();
  if (out[0].at !== 0) out.unshift({ at: 0, value: out[0].value });
  if (out[out.length - 1].at !== 1) {
    out.push({ at: 1, value: out[out.length - 1].value });
  }
  return out;
}

/**
 * Whether a track says anything.
 *
 * Checked on the *authored* keys, not the normalized ones: normalization pins
 * the ends, so a single keyframe becomes two identical ones and would emit a
 * constant `values="1;1"` animation — valid, inert, and pure noise in the file.
 * One keyframe means "hold this value", which is what not animating already
 * does.
 */
export function hasMotion(track: Track): boolean {
  return track.keys.filter((k) => k.at >= 0 && k.at <= 1).length >= 2;
}

function formatValue(property: Animatable, value: number | string): string {
  if (isColor(property)) return String(value);
  const num = typeof value === "number" ? value : Number(value);
  const safe = Number.isFinite(num) ? num : 0;
  switch (property) {
    case "translate-x":
      return `${n(safe, 3)} 0`;
    case "translate-y":
      return `0 ${n(safe, 3)}`;
    case "scale":
      return `${n(safe, 3)} ${n(safe, 3)}`;
    default:
      return n(safe, 3);
  }
}

/** The SMIL element for one track, or null when it has nothing to say. */
export function trackToSmil(track: Track, timeline: Timeline): string | null {
  if (!hasMotion(track)) return null;
  const keys = normalizeKeys(track.keys);
  if (keys.length < 2) return null;

  const values = keys.map((k) => formatValue(track.property, k.value)).join(";");
  const keyTimes = keys.map((k) => n(k.at, 4)).join(";");
  const common = `dur="${n(timeline.duration, 3)}s" repeatCount="${timeline.repeat ? "indefinite" : "1"}" fill="freeze" values="${values}" keyTimes="${keyTimes}"`;

  const transform = TRANSFORMS[track.property];
  if (transform) {
    // `additive="sum"` so an animated transform composes with whatever the
    // element already carries, instead of silently replacing it and teleporting
    // the shape to the origin.
    return `<animateTransform attributeName="transform" type="${transform}" additive="sum" ${common} />`;
  }
  return `<animate attributeName="${track.property}" ${common} />`;
}

/** CSS keyframes plus the rule that runs them, for one track. */
export function trackToCss(track: Track, timeline: Timeline, index: number): string | null {
  if (!hasMotion(track)) return null;
  const keys = normalizeKeys(track.keys);
  if (keys.length < 2) return null;

  const name = `nx-anim-${index}`;
  const declaration = (value: number | string): string => {
    switch (track.property) {
      case "translate-x":
        return `transform: translateX(${n(Number(value), 3)}px);`;
      case "translate-y":
        return `transform: translateY(${n(Number(value), 3)}px);`;
      case "scale":
        return `transform: scale(${n(Number(value), 3)});`;
      case "rotate":
        return `transform: rotate(${n(Number(value), 3)}deg);`;
      default:
        return `${track.property}: ${isColor(track.property) ? value : n(Number(value), 3)};`;
    }
  };

  const frames = keys
    .map((k) => `  ${n(k.at * 100, 2)}% { ${declaration(k.value)} }`)
    .join("\n");

  // `data-nx-anim`, not `data-nx-id`: the internal tag is stripped on the way
  // out (see `applyAnimation`), and a stylesheet pointing at an attribute that
  // no longer exists is a rule that silently does nothing.
  const selector =
    track.target === null ? "svg" : `[data-nx-anim="${track.target}"]`;

  return `@keyframes ${name} {
${frames}
}
${selector} {
  animation: ${name} ${n(timeline.duration, 3)}s linear ${timeline.repeat ? "infinite" : "1 forwards"};
  transform-box: fill-box;
  transform-origin: center;
}`;
}

export type AnimationFormat = "smil" | "css";

/**
 * Insert animation into a document.
 *
 * SMIL nests an element inside each target, so it needs the document's own
 * `data-nx-id` tagging to find them — the canvas already puts it there, which
 * is the reason this module could be small.
 */
export function applyAnimation(
  source: string,
  timeline: Timeline,
  format: AnimationFormat,
): string {
  // Always strip, on every path: this function's contract is "an exportable
  // document", and a caller should never have to know whether a timeline
  // happened to contain anything before deciding if the output is shippable.
  const usable = timeline.tracks.filter(hasMotion);
  if (usable.length === 0) return stripInternalIds(source);

  if (format === "css") {
    const css = usable
      .map((t, i) => trackToCss(t, timeline, i))
      .filter((c): c is string => c !== null)
      .join("\n\n");
    // A CDATA section, not bare text: a CSS rule can legitimately contain `<`
    // and `&`, which an XML parser would otherwise read as markup.
    const style = `<style>\n/* <![CDATA[ */\n${css}\n/* ]]> */\n</style>`;
    // Promote the internal tag to a real attribute on the elements the
    // stylesheet addresses, then drop the rest. Without the promotion the
    // rules would point at `data-nx-id`, which the strip below removes.
    let out = source;
    for (const track of usable) {
      if (track.target === null) continue;
      out = out.replace(
        new RegExp(`data-nx-id="${track.target}"`),
        `data-nx-anim="${track.target}"`,
      );
    }
    return stripInternalIds(insertAfterRoot(out, style));
  }

  // SMIL: one element per track, nested inside the element it drives.
  let out = source;
  const rootLevel: string[] = [];
  for (const track of usable) {
    const element = trackToSmil(track, timeline);
    if (!element) continue;
    if (track.target === null) {
      rootLevel.push(`  ${element}`);
      continue;
    }
    out = insertIntoElement(out, track.target, `    ${element}`);
  }
  const withRoot =
    rootLevel.length > 0 ? insertAfterRoot(out, rootLevel.join("\n")) : out;
  return stripInternalIds(withRoot);
}

/**
 * Remove the canvas's internal tagging from an exported document.
 *
 * `data-nx-id` exists so this app can trace a click back to a node; it means
 * nothing outside Nexis and has no business in a file somebody ships. The
 * canvas strips it on its own export path (`serializeSvg`) for the same
 * reason, and this is that rule applied to the animator's output.
 */
function stripInternalIds(source: string): string {
  return source.replace(/\s*data-nx-id="\d+"/g, "");
}

/** Put markup immediately after the opening `<svg …>` tag. */
function insertAfterRoot(source: string, markup: string): string {
  const root = /<svg\b[^>]*>/i.exec(source);
  if (!root) return source;
  const at = root.index + root[0].length;
  return `${source.slice(0, at)}\n${markup}${source.slice(at)}`;
}

/**
 * Nest markup inside the element carrying `data-nx-id="id"`.
 *
 * A self-closing target has to be reopened first — `<rect … />` cannot contain
 * a child, and rewriting it to `<rect …></rect>` is the only way to give it
 * one. Most icon art is self-closing, so this is the common path rather than
 * an edge case.
 */
function insertIntoElement(source: string, id: number, markup: string): string {
  const open = new RegExp(`<([a-z]+)\\b([^>]*\\bdata-nx-id="${id}"[^>]*)>`, "i");
  const m = open.exec(source);
  if (!m) return source;

  const [full, tag, attrs] = m;
  const selfClosing = attrs.trimEnd().endsWith("/");
  const cleanAttrs = selfClosing ? attrs.trimEnd().slice(0, -1).trimEnd() : attrs;
  const replacement = selfClosing
    ? `<${tag} ${cleanAttrs.trim()}>\n${markup}\n  </${tag}>`
    : `${full}\n${markup}`;

  return (
    source.slice(0, m.index) +
    replacement +
    source.slice(m.index + full.length)
  );
}

/** A track ready to drop on the timeline, with sensible ends for its property. */
export function newTrack(property: Animatable, target: number | null): Track {
  const ends: Record<Animatable, [number | string, number | string]> = {
    "opacity": [0, 1],
    "translate-x": [0, 24],
    "translate-y": [0, 24],
    "scale": [1, 1.2],
    "rotate": [0, 360],
    "fill": ["#3b82f6", "#f59e0b"],
    "stroke": ["#3b82f6", "#f59e0b"],
    "stroke-dashoffset": [100, 0],
  };
  const [from, to] = ends[property];
  return {
    id: `${property}-${Math.random().toString(36).slice(2, 8)}`,
    target,
    property,
    keys: [
      { at: 0, value: from },
      { at: 1, value: to },
    ],
  };
}
