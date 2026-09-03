// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Ready-made art: something on the canvas before you have decided anything.
 *
 * A blank document is the worst starting point a drawing tool can offer, and
 * the playground shipped with exactly one starter. These are the second thing
 * to reach for — pick one, then tune it with the sliders, the canvas or the
 * code pane, all of which already work on any document.
 *
 * ## Two sources, one shape
 *
 * Half of these are **hand-authored** icon-scale documents on a 24-unit grid
 * with a 1.5 stroke, which is the geometry the preview's 16/24/32/64 row is
 * built to judge. The other half are **generator output frozen at a good
 * parameter set** — `shapes.ts` already produces a complete, valid, tested
 * document from numbers, so a preset over it is a name and four numbers rather
 * than a second copy of the geometry. When a generator improves, its presets
 * improve with it.
 *
 * The consequence worth stating: no preset is a special case. Every one is
 * just a string that lands in the editor, so the optimizer, the sanitizer, the
 * canvas and all three export formats work on it without knowing it came from
 * here.
 */

import { defaultValues, shapeById } from "./shapes";

export const PRESET_GROUPS = [
  "Marks",
  "Shapes",
  "Patterns",
  "Dividers",
] as const;

export type PresetGroup = (typeof PRESET_GROUPS)[number];

export type SvgPreset = {
  id: string;
  label: string;
  group: PresetGroup;
  source: string;
};

/**
 * An icon-scale document with the house defaults already set.
 *
 * The attributes here are not arbitrary: a 24 viewBox with a 1.5 stroke and
 * round caps is what the app's own icon set uses, so a preset starts life
 * consistent with everything around it instead of needing to be talked into
 * shape afterwards.
 */
function icon(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
     fill="none" stroke="currentColor" stroke-width="1.5"
     stroke-linecap="round" stroke-linejoin="round">
${body}
</svg>`;
}

/** A filled icon: no stroke, one solid shape. */
function solid(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
${body}
</svg>`;
}

/**
 * A generator's output at a named parameter set.
 *
 * Unknown keys are ignored and missing ones fall back to the generator's own
 * defaults, so a preset does not have to restate every slider — and adding a
 * parameter to a generator later does not silently break the presets over it.
 */
function fromShape(id: string, overrides: Record<string, number> = {}): string {
  const shape = shapeById(id);
  if (!shape) return "";
  return shape.render({ ...defaultValues(shape), ...overrides });
}

export const SVG_PRESETS: readonly SvgPreset[] = [
  // ── Marks ─────────────────────────────────────────────────────────────────
  {
    id: "arrow-right",
    label: "Arrow",
    group: "Marks",
    source: icon(`  <path d="M4 12 H18" />
  <path d="M13 7 L18 12 L13 17" />`),
  },
  {
    id: "check",
    label: "Check",
    group: "Marks",
    source: icon(`  <path d="M4.5 12.5 L9.5 17.5 L19.5 6.5" />`),
  },
  {
    id: "play",
    label: "Play",
    group: "Marks",
    source: solid(`  <path d="M8 5.2 L18.5 12 L8 18.8 Z" />`),
  },
  {
    id: "bolt",
    label: "Bolt",
    group: "Marks",
    source: solid(`  <path d="M13.5 2 L5 13.5 H11 L10.5 22 L19 10.5 H13 Z" />`),
  },
  {
    id: "heart",
    label: "Heart",
    group: "Marks",
    source: icon(`  <path d="M12 20.5 C5 15.5 3 12.6 3 9.6 A4.6 4.6 0 0 1 12 7.4 A4.6 4.6 0 0 1 21 9.6 C21 12.6 19 15.5 12 20.5 Z" />`),
  },
  {
    id: "cloud",
    label: "Cloud",
    group: "Marks",
    source: icon(`  <path d="M7 18 H17 A4 4 0 0 0 17.6 10 A6 6 0 0 0 6.2 9.6 A4.2 4.2 0 0 0 7 18 Z" />`),
  },
  {
    id: "terminal",
    label: "Terminal",
    group: "Marks",
    source: icon(`  <rect x="2.5" y="4" width="19" height="16" rx="3" />
  <path d="M7 9.5 L10.5 12.5 L7 15.5" />
  <path d="M13 15.5 H17" />`),
  },
  {
    id: "folder",
    label: "Folder",
    group: "Marks",
    source: icon(`  <path d="M3 7 A2 2 0 0 1 5 5 H9 L11 7 H19 A2 2 0 0 1 21 9 V17 A2 2 0 0 1 19 19 H5 A2 2 0 0 1 3 17 Z" />`),
  },

  // ── Shapes ────────────────────────────────────────────────────────────────
  { id: "star-5", label: "Star", group: "Shapes", source: fromShape("star") },
  {
    id: "star-spike",
    label: "Spark",
    group: "Shapes",
    source: fromShape("star", { points: 4, inner: 14, outer: 112 }),
  },
  {
    id: "hexagon",
    label: "Hexagon",
    group: "Shapes",
    source: fromShape("polygon", { sides: 6, round: 14 }),
  },
  {
    id: "triangle",
    label: "Triangle",
    group: "Shapes",
    source: fromShape("polygon", { sides: 3, round: 18, rotation: 0 }),
  },
  { id: "gear-10", label: "Gear", group: "Shapes", source: fromShape("gear") },
  { id: "blob-soft", label: "Blob", group: "Shapes", source: fromShape("blob") },
  {
    id: "blob-wild",
    label: "Splat",
    group: "Shapes",
    source: fromShape("blob", { points: 12, variance: 0.45, seed: 1312 }),
  },
  {
    id: "spiral-tight",
    label: "Spiral",
    group: "Shapes",
    source: fromShape("spiral", { turns: 4.5, thickness: 2.5 }),
  },

  // ── Patterns ──────────────────────────────────────────────────────────────
  { id: "dots-even", label: "Dot grid", group: "Patterns", source: fromShape("dots") },
  {
    id: "dots-vignette",
    label: "Vignette dots",
    group: "Patterns",
    source: fromShape("dots", { columns: 14, rows: 14, size: 5, falloff: 0.85 }),
  },
  { id: "rings-4", label: "Rings", group: "Patterns", source: fromShape("rings") },
  {
    id: "burst-fine",
    label: "Burst",
    group: "Patterns",
    source: fromShape("burst", { rays: 28, thickness: 2, inner: 24 }),
  },
  { id: "grain-soft", label: "Grain", group: "Patterns", source: fromShape("grain") },
  {
    id: "wave-fill-deep",
    label: "Wave fill",
    group: "Patterns",
    source: fromShape("wave-fill", { amplitude: 34, frequency: 1.2, level: 140 }),
  },

  // ── Dividers ──────────────────────────────────────────────────────────────
  { id: "divider-curve", label: "Wavy rule", group: "Dividers", source: fromShape("divider") },
  {
    id: "divider-zigzag",
    label: "Zigzag rule",
    group: "Dividers",
    source: fromShape("divider", { round: 0, segments: 16, amplitude: 12 }),
  },
  {
    id: "wave-line",
    label: "Wave line",
    group: "Dividers",
    source: fromShape("wave", { amplitude: 18, frequency: 3, thickness: 2.5 }),
  },
  {
    id: "chevrons",
    label: "Chevrons",
    group: "Dividers",
    source: fromShape("chevron"),
  },
  {
    id: "arc-rule",
    label: "Arc",
    group: "Dividers",
    source: fromShape("arc", { sweep: 200, thickness: 4 }),
  },
];

export function presetById(id: string): SvgPreset | undefined {
  return SVG_PRESETS.find((p) => p.id === id);
}

/** Presets in a group, preserving registry order. */
export function presetsInGroup(group: PresetGroup): SvgPreset[] {
  return SVG_PRESETS.filter((p) => p.group === group);
}
