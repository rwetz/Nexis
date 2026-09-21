// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Place a second SVG into an existing one, so a canvas can hold several
 * pieces of art at once.
 *
 * Until now every preset and every generated shape called `replaceSource`:
 * picking a second one threw the first away, which made the playground a
 * viewer for one thing at a time rather than a canvas. This merges instead.
 *
 * Three things have to be right for a merge to be safe, and each has bitten
 * naive versions of this:
 *
 *  - **Ids collide.** Two copies of art that both define `<linearGradient
 *    id="a">` end up with every `url(#a)` reference in the document pointing
 *    at whichever came last, so the first piece silently repaints itself in
 *    the second's colours. Incoming ids are namespaced, and the references
 *    that point at them are rewritten in the same pass.
 *  - **Coordinate systems differ.** A 24x24 icon dropped into a 512x512
 *    canvas is invisible in the corner unless it is scaled. The incoming
 *    viewBox is mapped onto a target box in the host's units.
 *  - **The root's own attributes are not content.** `width`, `height`,
 *    `viewBox` and `xmlns` describe the incoming *document*; carried onto a
 *    `<g>` they either do nothing or actively break layout.
 *
 * Text in, text out. The playground's document of record is the source
 * string the user edits, so composing has to be a string transform — round
 * -tripping through a live DOM the user cannot see would make the editor and
 * the canvas disagree about what the document is.
 */

/** Attributes that belong to a document root, never to a group. */
const ROOT_ONLY_ATTRS = new Set([
  "width",
  "height",
  "viewbox",
  "xmlns",
  "xmlns:xlink",
  "version",
  "baseprofile",
  "preserveaspectratio",
  "x",
  "y",
]);

/** Attributes whose value can carry a `url(#id)` reference. */
const REF_ATTRS = [
  "fill",
  "stroke",
  "filter",
  "clip-path",
  "mask",
  "href",
  "xlink:href",
  "marker-start",
  "marker-mid",
  "marker-end",
  "fill-opacity",
  "stroke-opacity",
];

export type Box = { x: number; y: number; width: number; height: number };

export type ComposeResult =
  | { ok: true; svg: string }
  | { ok: false; reason: string };

function parse(svg: string): SVGSVGElement | null {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (doc.getElementsByTagName("parsererror").length > 0) return null;
  const root = doc.documentElement;
  return root && root.tagName.toLowerCase() === "svg"
    ? (root as unknown as SVGSVGElement)
    : null;
}

/** `viewBox` as numbers, falling back to width/height, then to 0 0 100 100. */
export function readViewBox(root: Element): Box {
  const raw = root.getAttribute("viewBox");
  if (raw) {
    const parts = raw.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
    }
  }
  const w = Number.parseFloat(root.getAttribute("width") ?? "");
  const h = Number.parseFloat(root.getAttribute("height") ?? "");
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    return { x: 0, y: 0, width: w, height: h };
  }
  return { x: 0, y: 0, width: 100, height: 100 };
}

/**
 * Rename every id defined inside `el`, and rewrite the references to them.
 *
 * Only ids this subtree actually defines are touched: rewriting a reference
 * whose target lives in the host document would break the reference rather
 * than protect it.
 */
function namespaceIds(el: Element, prefix: string): void {
  const defined = new Set<string>();
  const collect = (node: Element) => {
    const id = node.getAttribute("id");
    if (id) defined.add(id);
    for (const child of Array.from(node.children)) collect(child);
  };
  collect(el);
  if (defined.size === 0) return;

  const rename = (id: string) => `${prefix}${id}`;

  const rewrite = (node: Element) => {
    const id = node.getAttribute("id");
    if (id && defined.has(id)) node.setAttribute("id", rename(id));

    for (const attr of REF_ATTRS) {
      const value = node.getAttribute(attr);
      if (!value) continue;
      // `href="#a"` and `fill="url(#a)"` are both references; a bare `#a`
      // only counts for href-shaped attributes.
      let next = value.replace(/url\(\s*#([^)\s"']+)\s*\)/g, (m, id: string) =>
        defined.has(id) ? `url(#${rename(id)})` : m,
      );
      if (/^#/.test(value.trim())) {
        const bare = value.trim().slice(1);
        if (defined.has(bare)) next = `#${rename(bare)}`;
      }
      if (next !== value) node.setAttribute(attr, next);
    }

    // `style="fill:url(#a)"` is the same reference wearing a different hat.
    const style = node.getAttribute("style");
    if (style) {
      const next = style.replace(
        /url\(\s*#([^)\s"']+)\s*\)/g,
        (m, id: string) => (defined.has(id) ? `url(#${rename(id)})` : m),
      );
      if (next !== style) node.setAttribute("style", next);
    }

    for (const child of Array.from(node.children)) rewrite(child);
  };
  rewrite(el);
}

/** Short, collision-resistant enough for one document. */
function shortId(): string {
  return Math.random().toString(36).slice(2, 7);
}

/**
 * Merge `incoming` into `host`, scaled and translated into `target`.
 *
 * `target` is in the HOST's user units. Pass the box you want the new art to
 * occupy; the incoming viewBox is fitted into it, preserving aspect ratio,
 * because stretching someone's icon to fill a rectangle is never what they
 * meant by "add it here".
 */
export function composeSvg(
  host: string,
  incoming: string,
  target: Box,
  label?: string,
): ComposeResult {
  const hostRoot = parse(host);
  if (!hostRoot) return { ok: false, reason: "The canvas is not valid SVG" };
  const inRoot = parse(incoming);
  if (!inRoot) return { ok: false, reason: "That artwork is not valid SVG" };

  const src = readViewBox(inRoot);
  if (src.width <= 0 || src.height <= 0) {
    return { ok: false, reason: "That artwork has no usable size" };
  }

  // Contain, not cover: the whole piece has to be inside the box it was
  // given, and uniform, so nothing is distorted.
  const scale = Math.min(target.width / src.width, target.height / src.height);
  const drawW = src.width * scale;
  const drawH = src.height * scale;
  const dx = target.x + (target.width - drawW) / 2 - src.x * scale;
  const dy = target.y + (target.height - drawH) / 2 - src.y * scale;

  const prefix = `n${shortId()}-`;
  namespaceIds(inRoot, prefix);

  const doc = hostRoot.ownerDocument;
  const group = doc.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute(
    "transform",
    `translate(${round(dx)} ${round(dy)}) scale(${round(scale)})`,
  );
  // A name the user can find in the source, so a merged document stays
  // navigable by hand rather than becoming an anonymous pile of groups.
  group.setAttribute("data-nexis-piece", label ?? "artwork");

  // Everything the incoming ROOT carried that is legitimately inheritable
  // (fill, stroke, opacity, class…) moves onto the group; document-level
  // attributes are dropped.
  for (const attr of Array.from(inRoot.attributes)) {
    if (ROOT_ONLY_ATTRS.has(attr.name.toLowerCase())) continue;
    if (attr.name === "transform") continue;
    group.setAttribute(attr.name, attr.value);
  }

  for (const child of Array.from(inRoot.childNodes)) {
    group.appendChild(doc.importNode(child, true));
  }

  hostRoot.appendChild(group);
  return { ok: true, svg: new XMLSerializer().serializeToString(hostRoot) };
}

/** Three decimals is well inside SVG rendering precision and keeps the
 *  source readable — this string is something the user edits by hand. */
function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Where the next piece should go.
 *
 * Laid out on a grid across the host viewBox rather than stacked at the
 * origin: dropped at the same spot every time, the second piece hides the
 * first and "add" looks identical to "replace". `count` is how many pieces
 * are already placed.
 */
export function nextSlot(hostViewBox: Box, count: number): Box {
  const cols = 3;
  const cell = {
    width: hostViewBox.width / cols,
    height: hostViewBox.height / cols,
  };
  const col = count % cols;
  const row = Math.floor(count / cols) % cols;
  // Inset so adjacent pieces have visible air between them.
  const inset = Math.min(cell.width, cell.height) * 0.1;
  return {
    x: hostViewBox.x + col * cell.width + inset,
    y: hostViewBox.y + row * cell.height + inset,
    width: cell.width - inset * 2,
    height: cell.height - inset * 2,
  };
}

/** How many pieces `composeSvg` has already placed in this document. */
export function countPieces(svg: string): number {
  const root = parse(svg);
  if (!root) return 0;
  return root.querySelectorAll("[data-nexis-piece]").length;
}
