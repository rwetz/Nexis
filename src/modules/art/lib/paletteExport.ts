// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * A palette, in the four shapes it actually gets pasted into.
 *
 * Pure string building, like `svgExport.ts` — same reasoning, same testability.
 * The interesting part is not the formatting but the **naming**: a swatch is
 * called "Bright red" or "Brand / 500" in the panel, and none of those are
 * valid as a CSS custom property, a Tailwind key, or a JSON identifier. Every
 * format therefore slugs, and collisions are numbered rather than silently
 * overwriting — losing a colour because two of them were called "Blue" is the
 * kind of bug you find much later, in the stylesheet.
 */

export type PaletteEntry = { name: string; hex: string };

export const PALETTE_FORMATS = ["css", "tailwind", "json", "svg"] as const;
export type PaletteFormat = (typeof PALETTE_FORMATS)[number];

export const PALETTE_FORMAT_LABELS: Record<PaletteFormat, string> = {
  css: "CSS",
  tailwind: "Tailwind",
  json: "JSON",
  svg: "SVG",
};

export const PALETTE_FILE_EXTENSIONS: Record<PaletteFormat, string> = {
  css: "css",
  tailwind: "js",
  json: "json",
  svg: "svg",
};

/**
 * A name reduced to something safe as an identifier in every target format.
 *
 * Lowercase, non-alphanumerics collapsed to a single hyphen, ends trimmed. An
 * empty result falls back rather than emitting `--: #fff`, which is a parse
 * error in CSS and an invisible one in JSON.
 */
export function slug(name: string): string {
  const out = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return out || "color";
}

/**
 * Slug every entry, numbering duplicates. Order is preserved, and the *first*
 * of a repeated name keeps the bare slug so the common case reads naturally.
 */
export function uniqueSlugs(entries: readonly PaletteEntry[]): string[] {
  const seen = new Map<string, number>();
  return entries.map((e) => {
    const base = slug(e.name);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}-${n + 1}`;
  });
}

export function toCssVars(entries: readonly PaletteEntry[]): string {
  const names = uniqueSlugs(entries);
  const body = entries
    .map((e, i) => `  --${names[i]}: ${e.hex};`)
    .join("\n");
  return `:root {\n${body}\n}`;
}

export function toTailwind(entries: readonly PaletteEntry[]): string {
  const names = uniqueSlugs(entries);
  const body = entries
    .map((e, i) => `      "${names[i]}": "${e.hex}",`)
    .join("\n");
  return `// tailwind.config.js\nexport default {\n  theme: {\n    extend: {\n      colors: {\n${body}\n      },\n    },\n  },\n};`;
}

export function toJson(entries: readonly PaletteEntry[]): string {
  const names = uniqueSlugs(entries);
  const obj: Record<string, string> = {};
  entries.forEach((e, i) => {
    obj[names[i]] = e.hex;
  });
  return JSON.stringify(obj, null, 2);
}

/**
 * The palette as a swatch strip.
 *
 * Not a novelty: this is the format that goes in a README or a design doc, and
 * making it an SVG rather than a PNG means it stays sharp and stays diffable.
 * It also drops straight into the playground and the raster exporter, since it
 * is an ordinary document like everything else the pack produces.
 */
export function toSvgSwatches(entries: readonly PaletteEntry[]): string {
  const size = 64;
  const width = Math.max(1, entries.length) * size;
  const rects = entries
    .map(
      (e, i) =>
        `  <rect x="${i * size}" y="0" width="${size}" height="${size}" fill="${e.hex}"><title>${escapeXml(e.name)} ${e.hex}</title></rect>`,
    )
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${size}" width="${width}" height="${size}">\n${rects}\n</svg>`;
}

/** The five XML predefined entities. A swatch name is user text. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function formatPalette(
  entries: readonly PaletteEntry[],
  format: PaletteFormat,
): string {
  switch (format) {
    case "css":
      return toCssVars(entries);
    case "tailwind":
      return toTailwind(entries);
    case "json":
      return toJson(entries);
    case "svg":
      return toSvgSwatches(entries);
  }
}
