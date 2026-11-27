// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Ward: the brand's moving background, drawn as glyphs.
 *
 * Ported from the occult-dioramas brand kit (`brandkit/motion.js`, the
 * `ascii` motion): two rune rings turn in opposite directions around the
 * heptagram, all of it rendered small to an offscreen canvas and then
 * re-drawn as coloured monospace characters, the same glyph pass the ASCII
 * dioramas use. Up close it is text; from a distance it is the mark.
 *
 * Unlike the kit, which carries its own palettes, every colour here comes
 * from the active theme (`--brand` for the rings, `--foreground` into
 * `--brand` for the mark, `--muted-foreground` for the field) and is re-read
 * when `epoch` changes, so it follows a theme switch without remounting.
 * The canvas is transparent: the app background shows through, so it works
 * in light mode as well as dark.
 *
 * Cost: one getImageData of a ~170x60 offscreen canvas and a few thousand
 * fillText calls per frame, capped at 24 fps, suspended while the window is
 * hidden (rafLoop). Cells are bucketed by colour so fillStyle changes a
 * handful of times per frame, not once per glyph. Under reduced motion it
 * draws one still frame.
 */

import { memo, useEffect, useRef } from "react";
import { HEPTAGRAM } from "@/components/ui/nexis-mark";
import { resolveCssColor } from "@/styles/tokens";
import { runRafLoopWhileVisible } from "./rafLoop";

/** Brightness ramp, dark to bright. A space is skipped, not drawn. */
const RAMP = " .:-=+*#%@";
const FPS = 24;
/** Steps the mark's foreground-to-brand gradient is quantised into. */
const MARK_STEPS = 8;

type Rgb = [number, number, number];

function parseRgb(css: string): Rgb {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(css);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [128, 128, 128];
}

const rgbCss = ([r, g, b]: Rgb) => `rgb(${r | 0},${g | 0},${b | 0})`;
const mix = (a: Rgb, b: Rgb, u: number): Rgb => [
  a[0] + (b[0] - a[0]) * u,
  a[1] + (b[1] - a[1]) * u,
  a[2] + (b[2] - a[2]) * u,
];

/** A rune ring: two concentric circles and ticks, every seventh one long. */
function ward(
  c: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  rot: number,
  { ticks = 49, lw = 1, len = 0.045 } = {},
) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.strokeStyle = color;
  c.lineCap = "round";
  c.lineWidth = lw * 2;
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.stroke();
  c.lineWidth = lw;
  c.beginPath();
  c.arc(0, 0, r * 1.07, 0, Math.PI * 2);
  c.stroke();
  for (let i = 0; i < ticks; i++) {
    const a = (i / ticks) * Math.PI * 2;
    const long = i % 7 === 0;
    const L = long ? 1.9 : 1;
    c.lineWidth = lw * (long ? 2 : 1);
    c.beginPath();
    c.moveTo(Math.cos(a) * r * 1.012, Math.sin(a) * r * 1.012);
    c.lineTo(Math.cos(a) * r * (1.012 + len * L), Math.sin(a) * r * (1.012 + len * L));
    c.stroke();
  }
  c.restore();
}

type Palette = { glyph: string; accent: string; marks: string[] };

function readPalette(): Palette {
  const fg = parseRgb(resolveCssColor("var(--foreground)"));
  const brand = parseRgb(resolveCssColor("var(--brand)"));
  return {
    glyph: rgbCss(parseRgb(resolveCssColor("var(--muted-foreground)"))),
    accent: rgbCss(brand),
    marks: Array.from({ length: MARK_STEPS }, (_, i) => rgbCss(mix(fg, brand, i / (MARK_STEPS - 1)))),
  };
}

function AsciiWardImpl({ epoch = 0, className }: { epoch?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || typeof OffscreenCanvas === "undefined") return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const hepta = new Path2D(HEPTAGRAM);
    const palette = readPalette();
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    let W = 0;
    let H = 0;
    let m = 0;
    let cell = 14;
    let cw = 8.4;
    let cols = 0;
    let rows = 0;
    let off: OffscreenCanvas | null = null;
    let oc: OffscreenCanvasRenderingContext2D | null = null;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = cv.getBoundingClientRect();
      W = Math.max(1, Math.round(rect.width * dpr));
      H = Math.max(1, Math.round(rect.height * dpr));
      cv.width = W;
      cv.height = H;
      m = Math.min(W, H);
      cell = Math.max(12 * dpr, m / 56);
      cw = cell * 0.6;
      cols = Math.ceil(W / cw);
      rows = Math.ceil(H / cell);
      off = new OffscreenCanvas(cols, rows);
      oc = off.getContext("2d", { willReadFrequently: true });
    };

    const draw = (t: number) => {
      if (!oc) return;
      const C = cols;
      const R = rows;
      const sx = cw;
      const sy = cell;
      const cx = W / 2;
      const cy = H / 2;
      const ocx = cx / sx;
      const ocy = cy / sy;
      // Offscreen, in cell units, squashed vertically so a cell's 0.6 aspect
      // comes back out round. Red channel: rings. Blue: the mark. Green: the
      // faint outer ring that only lifts the field.
      oc.setTransform(1, 0, 0, 1, 0, 0);
      oc.fillStyle = "#000";
      oc.fillRect(0, 0, C, R);
      oc.setTransform(1, 0, 0, sx / sy, 0, (1 - sx / sy) * ocy);
      // Line widths are in cells: under about half a cell a ring anti-aliases
      // away to nothing and only its ticks survive the glyph pass.
      ward(oc, ocx, ocy, (m * 0.4) / sx, "#c33", t * 0.04, { lw: 0.45, len: 0.06 });
      ward(oc, ocx, ocy, (m * 0.52) / sx, "#555", -t * 0.02, { ticks: 98, lw: 0.35, len: 0.04 });
      const k = (m * 0.62) / sx / 844;
      oc.save();
      oc.translate(ocx - 512 * k, ocy - 511 * k);
      oc.scale(k, k);
      oc.fillStyle = "#33ccff";
      oc.fill(hepta, "evenodd");
      oc.restore();
      const d = oc.getImageData(0, 0, C, R).data;

      // Bucket each glyph by colour (flat [col, row, rampIndex] triples),
      // then draw bucket by bucket.
      const glyphs: number[] = [];
      const accent: number[] = [];
      const marks: number[][] = palette.marks.map(() => []);
      for (let j = 0; j < R; j++) {
        for (let i = 0; i < C; i++) {
          const p = (j * C + i) * 4;
          const r = d[p];
          const g = d[p + 1];
          const b = d[p + 2];
          let L: number;
          let bucket: number[];
          if (b > 40) {
            L = b / 255;
            bucket = marks[Math.min(MARK_STEPS - 1, ((j / R) * MARK_STEPS) | 0)];
          } else if (r > 40) {
            L = r / 255;
            bucket = accent;
          } else {
            const n = Math.sin(i * 0.31 + j * 0.17 + t * 0.9) * 0.5 + 0.5;
            L = 0.08 + n * 0.12 + (g / 255) * 0.4;
            bucket = glyphs;
          }
          const ci = Math.min(RAMP.length - 1, (L * RAMP.length) | 0);
          if (ci > 0) bucket.push(i, j, ci);
        }
      }

      ctx.clearRect(0, 0, W, H);
      ctx.font = `600 ${sy * 0.9}px 'Geist Mono Variable', 'Geist Mono', ui-monospace, Menlo, monospace`;
      ctx.textBaseline = "top";
      const paint = (list: number[], color: string) => {
        if (list.length === 0) return;
        ctx.fillStyle = color;
        for (let q = 0; q < list.length; q += 3) ctx.fillText(RAMP[list[q + 2]], list[q] * sx, list[q + 1] * sy);
      };
      paint(glyphs, palette.glyph);
      paint(accent, palette.accent);
      marks.forEach((list, idx) => paint(list, palette.marks[idx]));
    };

    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) draw(0);
    });
    ro.observe(cv);

    if (reduced) {
      draw(0);
      return () => ro.disconnect();
    }

    const start = performance.now();
    let last = -Infinity;
    const stop = runRafLoopWhileVisible((now) => {
      if (now - last < 1000 / FPS) return;
      last = now;
      draw((now - start) / 1000);
    });
    return () => {
      stop();
      ro.disconnect();
    };
  }, [epoch]);

  return <canvas ref={ref} aria-hidden className={className} />;
}

export const AsciiWardBackground = memo(AsciiWardImpl);
