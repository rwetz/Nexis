// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * SVG to PNG, without a dependency and without silently losing the colour.
 *
 * ## The trap this module exists to handle
 *
 * Rasterizing is `<img src="data:image/svg+xml,…">` drawn onto a canvas. That
 * is the *safe* way to do it — an SVG loaded as an image renders in a
 * restricted mode with no script and no external fetches — but it is also an
 * **isolated document**, and the page's custom properties do not cascade into
 * it. This is pitfall #18's constraint arriving from the other direction: the
 * file-tree art has to be inlined because `var(--terminal-ansi-*)` cannot reach
 * a `data:` URL, and for exactly the same reason `currentColor` and
 * `var(--…)` cannot reach one here.
 *
 * `currentColor` in an isolated document falls back to the initial value of
 * `color`, which is black. So every themed icon in this app — all of which are
 * `stroke="currentColor"` on purpose — would export as a black-on-transparent
 * PNG that looks fine on a light background and invisible on a dark one, with
 * nothing anywhere saying why.
 *
 * The fix is to resolve the colour *into the markup* before rasterizing, which
 * is why `svgToPngBlob` takes a colour rather than inferring one. The caller
 * knows what the art should be; this module refuses to guess.
 *
 * ## Why the size has to be worked out rather than read
 *
 * A `<img>` with an SVG source has no intrinsic size unless the document
 * carries `width`/`height` in absolute units. Icon-scale art usually carries a
 * `viewBox` and nothing else, and Chromium then falls back to 300x150 — the
 * replaced-element default — which crops or letterboxes the export without
 * error. So the target size is computed from the source and set explicitly on
 * the canvas.
 */

/** A resolved colour to substitute, or `null` to leave the markup alone. */
export type RasterOptions = {
  /** Multiplier over the document's intrinsic size. */
  scale?: number;
  /**
   * What `currentColor` becomes. Required for themed art — see the module
   * note. `null` leaves the markup untouched, which is right for a document
   * that already names its own colours.
   */
  color?: string | null;
  /** Painted behind the art. Omit for transparency. */
  background?: string | null;
};

export type RasterSize = { width: number; height: number };

const FALLBACK_SIZE: RasterSize = { width: 300, height: 150 };

/**
 * The size an SVG document wants to be, in CSS pixels.
 *
 * Order matters: explicit `width`/`height` win, then the `viewBox`, then the
 * spec's replaced-element default. Percentages and units that do not map to a
 * canvas pixel are ignored rather than half-parsed — `width="100%"` says
 * nothing about intrinsic size, and reading it as 100 would be a silent wrong
 * answer instead of a visible failure.
 *
 * Two things this has to get right, both found by running it rather than by
 * reasoning about it:
 *
 * - **Only the root start tag is searched.** Scanning the whole document finds
 *   the first child with a `height`, and a `<rect height="18">` inside a 24-unit
 *   icon is not the icon's size.
 * - **The attribute name must be whole.** `\bwidth` matches inside
 *   `stroke-width`, because `-` is a word boundary — so an icon carrying
 *   `stroke-width="1.5"` reported itself as 1.5px wide and exported as a sliver.
 */
export function intrinsicSize(svg: string): RasterSize {
  // Everything below reads the root `<svg …>` start tag and nothing else.
  const root = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? "";

  const attr = (name: string): number | null => {
    // `(?:^|[\s"'])` before the name is what keeps `width` out of
    // `stroke-width`: the character before the match must be whitespace or a
    // quote, never a hyphen.
    const m = new RegExp(`(?:^|[\\s"'])${name}\\s*=\\s*"([^"]*)"`, "i").exec(root);
    if (!m) return null;
    const raw = m[1].trim();
    const num = /^[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/.exec(raw);
    if (!num) return null;
    const value = Number.parseFloat(num[0]);
    if (!Number.isFinite(value) || value <= 0) return null;
    // px is the only unit that maps to a canvas pixel without a conversion;
    // anything else (%, em, mm) is a value this cannot honestly use.
    const unit = raw.slice(num[0].length).trim().toLowerCase();
    if (unit !== "" && unit !== "px") return null;
    return value;
  };

  const w = attr("width");
  const h = attr("height");
  if (w !== null && h !== null) return { width: w, height: h };

  const vb = /(?:^|[\s"'])viewBox\s*=\s*"([^"]*)"/i.exec(root);
  if (vb) {
    const parts = vb[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      const [, , vw, vh] = parts;
      if (vw > 0 && vh > 0) return { width: vw, height: vh };
    }
  }

  return FALLBACK_SIZE;
}

/**
 * Replace `currentColor` with a literal colour.
 *
 * Only whole tokens are replaced, so a document that happens to contain the
 * word inside an id or a comment is not corrupted. Case-insensitive because
 * SVG attribute *values* are, in practice, written every way.
 */
export function resolveCurrentColor(svg: string, color: string): string {
  return svg.replace(/\bcurrentColor\b/gi, color);
}

/** Whether rasterizing this document would lose its colour without help. */
export function needsColorResolution(svg: string): boolean {
  return /\bcurrentColor\b/i.test(svg) || /var\(\s*--/.test(svg);
}

/**
 * Render to a PNG blob.
 *
 * Rejects rather than resolving an empty image when the source will not
 * decode: a corrupt export that looks like a successful one is worse than an
 * error, because it is discovered later and somewhere else.
 */
export async function svgToPngBlob(
  svg: string,
  options: RasterOptions = {},
): Promise<Blob> {
  const { scale = 1, color = null, background = null } = options;
  const source = color ? resolveCurrentColor(svg, color) : svg;
  const base = intrinsicSize(source);
  const width = Math.max(1, Math.round(base.width * scale));
  const height = Math.max(1, Math.round(base.height * scale));

  // A Blob URL rather than a `data:` URL: no percent-encoding to get wrong,
  // and no length ceiling to run into on a large document.
  const url = URL.createObjectURL(
    new Blob([source], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const img = new Image();
    img.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () =>
        reject(new Error("the SVG could not be decoded as an image"));
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("could not get a 2D canvas context");
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(img, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("the canvas produced no PNG data"));
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** PNG bytes, ready for the bytes-taking write command. */
export async function svgToPngBytes(
  svg: string,
  options: RasterOptions = {},
): Promise<Uint8Array> {
  const blob = await svgToPngBlob(svg, options);
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * A filename for an exported document.
 *
 * Anything that is not plainly safe in a path segment collapses to a hyphen —
 * this value reaches the filesystem, and the backend's own guards are a
 * backstop, not a reason to hand them something ugly.
 */
export function exportFileName(stem: string, extension: string): string {
  const cleaned = stem
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 64);
  return `${cleaned || "art"}.${extension}`;
}
