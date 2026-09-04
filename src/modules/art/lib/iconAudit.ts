// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Auditing a folder of SVGs for the drift that makes an icon set look
 * assembled rather than designed.
 *
 * This panel exists because Nexis had exactly this problem and wrote it down:
 * CLAUDE.md pitfall #18 is the story of 160 icon imports expressing 136 ideas
 * across **13 pixel sizes and 12 stroke weights**, accumulated a little at a
 * time until the UI stopped reading as one product. Nothing caught it, because
 * every individual addition looked fine. This is the thing that would have.
 *
 * ## What counts as a finding
 *
 * Only *inconsistency within the set*, never a judgement about any one file.
 * A 1.5 stroke is not wrong; a set containing 1.5 **and** 2 **and** 1.25 is,
 * and which of the three is "correct" is the author's call and not this
 * module's. So findings name the minority spellings and leave the decision
 * alone — the majority is reported as the set's convention, not as a rule.
 *
 * The parsing is deliberately tolerant. These are files on someone's disk, not
 * output from this app: a file that will not parse is reported as unreadable
 * and the audit continues, because one bad export must not cost you the report
 * on the other forty.
 */

export type IconFile = { name: string; source: string };

export type IconFacts = {
  name: string;
  /** `null` when the document has no usable viewBox. */
  viewBox: [number, number, number, number] | null;
  /** Square viewBox side, or null when it is not square. */
  canvas: number | null;
  /** Distinct stroke widths found anywhere in the document. */
  strokeWidths: number[];
  /** Distinct literal colours, excluding `none` and `currentColor`. */
  literalColors: string[];
  usesCurrentColor: boolean;
  strokeLinecaps: string[];
  elementCount: number;
  bytes: number;
  /** Set when the file could not be understood at all. */
  error: string | null;
};

export type Finding = {
  kind:
    | "canvas-size"
    | "non-square"
    | "missing-viewbox"
    | "stroke-width"
    | "literal-color"
    | "mixed-linecap"
    | "unreadable";
  /** One line, already phrased for display. */
  message: string;
  /** Files this applies to. */
  files: string[];
  severity: "warn" | "info";
};

const NUM = /^[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?$/;

function numbers(value: string): number[] {
  return value
    .trim()
    .split(/[\s,]+/)
    .filter((t) => NUM.test(t))
    .map(Number)
    .filter((v) => Number.isFinite(v));
}

/** Every value of an attribute across the whole document, in order. */
function attrValues(source: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`(?:^|[\\s"'])${name}\\s*=\\s*"([^"]*)"`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) out.push(m[1].trim());
  return out;
}

/**
 * Read one file's facts. Never throws: an unreadable file becomes a fact with
 * an `error`, because the report on the other forty is the point.
 */
export function readIconFacts(file: IconFile): IconFacts {
  const base: IconFacts = {
    name: file.name,
    viewBox: null,
    canvas: null,
    strokeWidths: [],
    literalColors: [],
    usesCurrentColor: false,
    strokeLinecaps: [],
    elementCount: 0,
    bytes: file.source.length,
    error: null,
  };

  const root = /<svg\b[^>]*>/i.exec(file.source);
  if (!root) return { ...base, error: "no <svg> root element" };

  const vbRaw = /(?:^|[\s"'])viewBox\s*=\s*"([^"]*)"/i.exec(root[0])?.[1];
  let viewBox: IconFacts["viewBox"] = null;
  if (vbRaw) {
    const parts = numbers(vbRaw);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      viewBox = [parts[0], parts[1], parts[2], parts[3]];
    }
  }

  const strokeWidths = [
    ...new Set(
      attrValues(file.source, "stroke-width")
        .flatMap((v) => numbers(v))
        .filter((v) => v > 0),
    ),
  ].sort((a, b) => a - b);

  const paints = [
    ...attrValues(file.source, "stroke"),
    ...attrValues(file.source, "fill"),
    ...attrValues(file.source, "stop-color"),
  ];
  const literalColors = [
    ...new Set(
      paints
        .map((p) => p.toLowerCase())
        .filter(
          (p) =>
            p !== "" &&
            p !== "none" &&
            p !== "currentcolor" &&
            p !== "inherit" &&
            p !== "transparent" &&
            !p.startsWith("url("),
        ),
    ),
  ].sort();

  return {
    ...base,
    viewBox,
    canvas: viewBox && viewBox[2] === viewBox[3] ? viewBox[2] : null,
    strokeWidths,
    literalColors,
    usesCurrentColor: /currentColor/i.test(file.source),
    strokeLinecaps: [
      ...new Set(attrValues(file.source, "stroke-linecap").map((v) => v.toLowerCase())),
    ].sort(),
    elementCount: (file.source.match(/<[a-z]/gi) ?? []).length,
  };
}

/** The most common value, and how many share it. Ties break on the smaller. */
function majority<T extends string | number>(
  values: readonly T[],
): { value: T; count: number } | null {
  if (values.length === 0) return null;
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: { value: T; count: number } | null = null;
  for (const [value, count] of counts) {
    if (!best || count > best.count || (count === best.count && value < best.value)) {
      best = { value, count };
    }
  }
  return best;
}

/**
 * Compare a set against itself.
 *
 * Every finding names the *minority* and reports the majority as the set's
 * convention. Nothing here decides which spelling is correct — that is the
 * author's call, and a linter that picks for you is a linter people turn off.
 */
export function auditIcons(facts: readonly IconFacts[]): Finding[] {
  const findings: Finding[] = [];
  const usable = facts.filter((f) => !f.error);

  const unreadable = facts.filter((f) => f.error);
  if (unreadable.length > 0) {
    findings.push({
      kind: "unreadable",
      severity: "warn",
      message: `${unreadable.length} file${unreadable.length === 1 ? "" : "s"} could not be read as SVG`,
      files: unreadable.map((f) => f.name),
    });
  }

  const missingViewBox = usable.filter((f) => f.viewBox === null);
  if (missingViewBox.length > 0) {
    findings.push({
      kind: "missing-viewbox",
      severity: "warn",
      message:
        "no usable viewBox, so these do not scale with the rest of the set",
      files: missingViewBox.map((f) => f.name),
    });
  }

  const nonSquare = usable.filter((f) => f.viewBox !== null && f.canvas === null);
  if (nonSquare.length > 0) {
    findings.push({
      kind: "non-square",
      severity: "info",
      message: "a non-square viewBox, which will letterbox in a square slot",
      files: nonSquare.map((f) => f.name),
    });
  }

  const canvases = usable
    .map((f) => f.canvas)
    .filter((c): c is number => c !== null);
  const canvasMajority = majority(canvases);
  if (canvasMajority && new Set(canvases).size > 1) {
    const odd = usable.filter(
      (f) => f.canvas !== null && f.canvas !== canvasMajority.value,
    );
    findings.push({
      kind: "canvas-size",
      severity: "warn",
      message: `${new Set(canvases).size} different canvas sizes; ${canvasMajority.count} of ${canvases.length} use ${canvasMajority.value}`,
      files: odd.map((f) => `${f.name} (${f.canvas})`),
    });
  }

  // A file may carry several stroke widths legitimately; the set's convention
  // is the most common *primary* width, which is the first one each file uses.
  const primaryWidths = usable
    .map((f) => f.strokeWidths[0])
    .filter((w): w is number => w !== undefined);
  const widthMajority = majority(primaryWidths);
  if (widthMajority && new Set(primaryWidths).size > 1) {
    const odd = usable.filter(
      (f) => f.strokeWidths[0] !== undefined && f.strokeWidths[0] !== widthMajority.value,
    );
    findings.push({
      kind: "stroke-width",
      severity: "warn",
      message: `${new Set(primaryWidths).size} different stroke widths; ${widthMajority.count} of ${primaryWidths.length} use ${widthMajority.value}`,
      files: odd.map((f) => `${f.name} (${f.strokeWidths.join(", ")})`),
    });
  }

  const withLiterals = usable.filter((f) => f.literalColors.length > 0);
  if (withLiterals.length > 0 && withLiterals.length < usable.length) {
    findings.push({
      kind: "literal-color",
      severity: "warn",
      message:
        "a baked-in colour rather than currentColor, so these cannot take the theme",
      files: withLiterals.map((f) => `${f.name} (${f.literalColors.join(", ")})`),
    });
  }

  const caps = usable.flatMap((f) => f.strokeLinecaps);
  if (new Set(caps).size > 1) {
    const capMajority = majority(caps);
    const odd = usable.filter(
      (f) =>
        f.strokeLinecaps.length > 0 &&
        !f.strokeLinecaps.includes(capMajority?.value ?? ""),
    );
    if (odd.length > 0) {
      findings.push({
        kind: "mixed-linecap",
        severity: "info",
        message: `mixed stroke-linecap; most of the set uses "${capMajority?.value}"`,
        files: odd.map((f) => `${f.name} (${f.strokeLinecaps.join(", ")})`),
      });
    }
  }

  return findings;
}

/** A one-line summary of what the set looks like, for the panel's header. */
export function summarize(facts: readonly IconFacts[]): string {
  const usable = facts.filter((f) => !f.error);
  if (usable.length === 0) return "No readable SVGs";
  const canvases = new Set(
    usable.map((f) => f.canvas).filter((c): c is number => c !== null),
  );
  const widths = new Set(usable.flatMap((f) => f.strokeWidths));
  const parts = [`${usable.length} icons`];
  if (canvases.size > 0) {
    parts.push(
      canvases.size === 1
        ? `${[...canvases][0]}px canvas`
        : `${canvases.size} canvas sizes`,
    );
  }
  if (widths.size > 0) {
    parts.push(
      widths.size === 1 ? `${[...widths][0]} stroke` : `${widths.size} stroke widths`,
    );
  }
  return parts.join(" - ");
}
