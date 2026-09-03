// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * A deliberately conservative SVG optimizer.
 *
 * **Why not SVGO.** The roadmap named it, and it is the obvious answer, but it
 * is a large dependency (plus `css-select` / `css-tree`) pulled in for one
 * panel, and every dependency here is supposed to earn its place. What this
 * panel actually needs is the icon-scale subset: strip editor cruft, collapse
 * whitespace, round coordinates, shorten colours. That is a bounded problem
 * with a testable answer, and the byte counts it reports are real.
 *
 * **What it will not do.** No path-data rewriting (no arc/curve conversion, no
 * segment merging, no relative/absolute switching), no transform collapsing,
 * no element unwrapping, no style-to-attribute conversion. Those are where
 * SVGO earns its size and where a naive implementation silently corrupts art.
 * Swapping this for SVGO later is a change to `optimizeSvg` alone.
 *
 * Every transform below is one a human could do by hand and verify by eye.
 */

export type OptimizeOptions = {
  /** Decimal places kept on coordinates and path data. */
  precision?: number;
  /** Drop `<title>`/`<desc>`. Off by default: they carry accessible names. */
  stripTitles?: boolean;
};

export type OptimizeResult = {
  svg: string;
  beforeBytes: number;
  afterBytes: number;
  /** Human-readable list of what actually changed something. */
  applied: string[];
};

/** UTF-8 byte length — the number that matters for a file on disk. */
export function byteLength(text: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(text).length;
  }
  // Node/test fallback.
  return Buffer.byteLength(text, "utf8");
}

/** Editor-only namespaces whose attributes carry nothing a renderer reads. */
const EDITOR_NS = ["sodipodi", "inkscape", "krita", "figma", "serif"];

function roundNumbers(text: string, precision: number): string {
  // Only plain decimals are touched. Exponent forms and integers are left
  // exactly as they are: rewriting them buys almost nothing and is where an
  // over-clever pass starts changing geometry.
  return text.replace(/-?\d+\.\d+/g, (m) => {
    const n = Number(m);
    if (!Number.isFinite(n)) return m;
    const rounded = Number(n.toFixed(precision));
    // `String` drops the trailing zeros `toFixed` adds, and "0.5" stays
    // shorter than "0.50".
    const out = String(rounded);
    return out.length < m.length ? out : m;
  });
}

function shortenHexColors(text: string): string {
  return text.replace(
    /#([0-9a-fA-F]{6})\b/g,
    (m, hex: string) => {
      const [r1, r2, g1, g2, b1, b2] = hex;
      return r1.toLowerCase() === r2.toLowerCase() &&
        g1.toLowerCase() === g2.toLowerCase() &&
        b1.toLowerCase() === b2.toLowerCase()
        ? `#${r1}${g1}${b1}`.toLowerCase()
        : m;
    },
  );
}

export function optimizeSvg(
  input: string,
  options: OptimizeOptions = {},
): OptimizeResult {
  const precision = options.precision ?? 2;
  const beforeBytes = byteLength(input);
  const applied: string[] = [];

  let svg = input;
  const step = (label: string, next: string) => {
    if (next !== svg) {
      svg = next;
      applied.push(label);
    }
  };

  step("removed the XML declaration", svg.replace(/<\?xml[\s\S]*?\?>/g, ""));
  step("removed the DOCTYPE", svg.replace(/<!DOCTYPE[\s\S]*?>/gi, ""));
  step("removed comments", svg.replace(/<!--[\s\S]*?-->/g, ""));
  step(
    "removed <metadata>",
    svg.replace(/<metadata[\s\S]*?<\/metadata>/gi, ""),
  );

  if (options.stripTitles) {
    step(
      "removed <title> and <desc>",
      svg
        .replace(/<title[\s\S]*?<\/title>/gi, "")
        .replace(/<desc[\s\S]*?<\/desc>/gi, ""),
    );
  }

  for (const ns of EDITOR_NS) {
    // Elements, then attributes, then the namespace declaration itself.
    step(
      `removed ${ns} data`,
      svg
        .replace(new RegExp(`<${ns}:[\\s\\S]*?<\\/${ns}:[^>]*>`, "gi"), "")
        .replace(new RegExp(`<${ns}:[^>]*\\/>`, "gi"), "")
        .replace(new RegExp(`\\s${ns}:[\\w-]+\\s*=\\s*"[^"]*"`, "gi"), "")
        .replace(new RegExp(`\\s${ns}:[\\w-]+\\s*=\\s*'[^']*'`, "gi"), "")
        .replace(new RegExp(`\\sxmlns:${ns}\\s*=\\s*"[^"]*"`, "gi"), ""),
    );
  }

  step(
    "dropped the redundant version attribute",
    svg.replace(/\sversion\s*=\s*"1\.1"/gi, ""),
  );
  step("dropped empty attributes", svg.replace(/\s[\w:-]+\s*=\s*""/g, ""));
  step("collapsed whitespace between tags", svg.replace(/>\s+</g, "><"));
  step(
    "collapsed runs of whitespace",
    svg.replace(/[ \t\r\n]{2,}/g, " ").replace(/\n/g, ""),
  );
  step(`rounded numbers to ${precision} dp`, roundNumbers(svg, precision));
  step("shortened hex colours", shortenHexColors(svg));

  svg = svg.trim();

  return { svg, beforeBytes, afterBytes: byteLength(svg), applied };
}

/** Percentage saved, floored at 0 so a no-op never reads as a regression. */
export function savingsPercent(result: OptimizeResult): number {
  if (result.beforeBytes === 0) return 0;
  const saved =
    ((result.beforeBytes - result.afterBytes) / result.beforeBytes) * 100;
  return Math.max(0, Math.round(saved * 10) / 10);
}

/** Bytes rendered the way a file listing would show them. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}
