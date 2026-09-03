// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * What the live preview is allowed to put into the document.
 *
 * SVG is not an inert image format. It can carry `<script>`, event-handler
 * attributes, `javascript:` URLs, and `<foreignObject>` (which is a hole
 * straight through to arbitrary HTML). The playground renders its source
 * inline — it has to, since `var(--...)` and `currentColor` do not resolve
 * inside a `data:` URL (the same reason the file-tree art is inlined, pitfall
 * #18) — so that markup lands in a **Tauri webview with `window.__TAURI__` in
 * scope**. Design principle 5 is "safe by default", and "the user pasted it
 * themselves" is not a security model: the whole point of a playground is
 * pasting art found elsewhere.
 *
 * So the preview gets a sanitized copy. The editor keeps the original — what
 * you export is what you wrote — and the panel says when something was
 * withheld, rather than silently rendering different art from the source.
 */

export type SanitizeResult = {
  svg: string;
  /** What was removed, for the notice the panel shows. Empty means clean. */
  removed: string[];
};

/**
 * Whether a URL attribute value would execute if the browser resolved it.
 *
 * The normalization is the whole substance of this function, and it mirrors
 * what a browser does before it looks at the scheme: numeric character
 * references are decoded, then whitespace is removed. A tab inside the scheme,
 * or an entity standing in for one, produces a live URL that contains no
 * literal "javascript:" for a substring check to find — which is exactly how
 * naive sanitizers get bypassed. `\s` is the right class here because tab,
 * newline and carriage return are precisely the characters the URL parser
 * strips, along with leading spaces.
 *
 * `data:` stays allowed for images: embedding a raster or a nested SVG is
 * legitimate, and a document referenced that way renders in a restricted mode
 * that does not run script. `data:text/html` does not get that treatment.
 */
function isDangerousUrl(value: string): boolean {
  const decoded = value.replace(
    /&#(x?)([0-9a-fA-F]+);?/gi,
    (_m, hex: string, digits: string) => {
      const code = Number.parseInt(digits, hex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCharCode(code) : "";
    },
  );
  const normalized = decoded.replace(/\s/g, "").toLowerCase();
  return (
    normalized.startsWith("javascript:") ||
    normalized.startsWith("vbscript:") ||
    normalized.startsWith("data:text/html")
  );
}

export function sanitizeSvgForPreview(input: string): SanitizeResult {
  const removed: string[] = [];
  let svg = input;

  const strip = (label: string, next: string) => {
    if (next !== svg) {
      svg = next;
      if (!removed.includes(label)) removed.push(label);
    }
  };

  // Script, in both the paired and self-closing spellings.
  strip(
    "<script>",
    svg
      .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
      .replace(/<script[^>]*\/>/gi, ""),
  );

  // foreignObject is arbitrary HTML inside SVG — there is no safe subset of it
  // worth supporting for icon-scale art.
  strip(
    "<foreignObject>",
    svg
      .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "")
      .replace(/<foreignObject[^>]*\/>/gi, ""),
  );

  // <set>/<animate> can assign to an event-handler attribute at runtime, which
  // reintroduces script after the attribute pass below has already run.
  strip(
    "attribute animation targeting an event handler",
    svg.replace(
      /<(set|animate)\b[^>]*attributeName\s*=\s*["']\s*on\w+[\s\S]*?(?:\/>|<\/\1\s*>)/gi,
      "",
    ),
  );

  // Event-handler attributes, quoted and unquoted.
  strip(
    "event handler attributes",
    svg
      .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
      .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
      .replace(/\son\w+\s*=\s*[^\s>]+/gi, ""),
  );

  // URL-bearing attributes are decided on the *normalized* value, never on the
  // raw text — see isDangerousUrl.
  strip(
    "javascript: URLs",
    svg.replace(
      /\s(?:xlink:)?(?:href|src|from|to|values)\s*=\s*("|')([\s\S]*?)\1/gi,
      (match: string, _quote: string, value: string) =>
        isDangerousUrl(value) ? "" : match,
    ),
  );

  return { svg, removed };
}
