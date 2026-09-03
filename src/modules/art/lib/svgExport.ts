// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The three shapes a piece of SVG leaves this app in.
 *
 * Raw is the file. JSX is what it looks like pasted into a component. A
 * `data:` URI is what it looks like in CSS — and it is the one with a real
 * trap in it, which is why it is here rather than inline at the call site.
 */

export type ExportFormat = "svg" | "jsx" | "data-uri";

export const EXPORT_LABELS: Record<ExportFormat, string> = {
  "svg": "SVG",
  "jsx": "JSX",
  "data-uri": "data: URI",
};

/**
 * Attributes React spells differently from SVG. Only the ones that actually
 * turn up in icon-scale art are listed; a hyphenated attribute React does not
 * know is left alone rather than mangled into a wrong guess.
 */
const JSX_ATTRIBUTE_NAMES: Record<string, string> = {
  "class": "className",
  "stroke-width": "strokeWidth",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
  "stroke-dasharray": "strokeDasharray",
  "stroke-dashoffset": "strokeDashoffset",
  "stroke-opacity": "strokeOpacity",
  "stroke-miterlimit": "strokeMiterlimit",
  "fill-opacity": "fillOpacity",
  "fill-rule": "fillRule",
  "clip-path": "clipPath",
  "clip-rule": "clipRule",
  "stop-color": "stopColor",
  "stop-opacity": "stopOpacity",
  "font-family": "fontFamily",
  "font-size": "fontSize",
  "font-weight": "fontWeight",
  "text-anchor": "textAnchor",
  "dominant-baseline": "dominantBaseline",
  "vector-effect": "vectorEffect",
  "color-interpolation-filters": "colorInterpolationFilters",
  "xlink:href": "xlinkHref",
  "xml:space": "xmlSpace",
};

/** SVG → JSX: rename attributes, and comment out what JSX cannot carry. */
export function toJsx(svg: string): string {
  let out = svg;

  // `xmlns:xlink` and friends are invalid JSX attribute names and React warns
  // on them; the plain `xmlns` is fine and is kept.
  out = out.replace(/\sxmlns:[\w-]+\s*=\s*("[^"]*"|'[^']*')/g, "");

  out = out.replace(
    /(\s)([\w:-]+)(\s*=\s*)/g,
    (match, space: string, name: string, eq: string) => {
      const mapped = JSX_ATTRIBUTE_NAMES[name];
      if (mapped) return `${space}${mapped}${eq}`;
      // An unknown hyphenated/namespaced name is left verbatim: React passes
      // through anything it does not recognise, and guessing a camelCase form
      // would produce an attribute the DOM ignores.
      return match;
    },
  );

  // XML comments are not JSX comments.
  out = out.replace(/<!--([\s\S]*?)-->/g, (_m, body: string) => `{/*${body}*/}`);

  return out.trim();
}

/**
 * SVG → `data:` URI.
 *
 * Percent-encoding rather than base64 is deliberate: for markup this size it
 * is both smaller and readable in a stylesheet. The character set below is the
 * one that actually has to be escaped for a URI sitting inside a CSS `url()`
 * — `#` would start a fragment, `%` must not be ambiguous, and the quote
 * characters would close the CSS string.
 *
 * The markup is whitespace-collapsed first, because a newline inside `url()`
 * is a parse error in CSS rather than something the browser tolerates.
 */
export function toDataUri(svg: string): string {
  const collapsed = svg.replace(/[\n\r\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  const escaped = collapsed
    .replace(/%/g, "%25")
    .replace(/#/g, "%23")
    .replace(/"/g, "%22")
    .replace(/'/g, "%27")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/&/g, "%26");
  return `data:image/svg+xml,${escaped}`;
}

/** Render the current source in the requested format. */
export function formatFor(svg: string, format: ExportFormat): string {
  switch (format) {
    case "jsx":
      return toJsx(svg);
    case "data-uri":
      return toDataUri(svg);
    case "svg":
      return svg.trim();
  }
}

/**
 * Whether the text is plausibly an SVG document.
 *
 * The preview renders source straight into the document, so this is the gate
 * that keeps a half-typed tag or a stray paste from being injected as markup.
 * It is a shape check, not a validator — the browser is the validator.
 */
export function looksLikeSvg(text: string): boolean {
  const t = text.trim();
  return /^<svg[\s>]/i.test(t) && /<\/svg>\s*$/i.test(t);
}
