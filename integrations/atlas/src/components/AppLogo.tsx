// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { cn } from "@/lib/utils";

/** Atlas mark — four extruded blocks on an isometric plate, drawn with the
 * same projection the map renders with. Self-contained palette (dark tile,
 * one coral tower) so it reads identically in light and dark, matching the
 * family convention. `defs` ids are `im-`-prefixed because inline SVG ids are
 * document-global. */
export function AtlasLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 256 256"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-12", className)}
      aria-label="Atlas"
    >
      <defs>
        <linearGradient id="im-bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1e1e24" />
          <stop offset="100%" stopColor="#121216" />
        </linearGradient>
        <pattern id="im-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path
            d="M 24 0 L 0 0 0 24"
            fill="none"
            stroke="#ffffff"
            strokeWidth="1"
            strokeOpacity="0.03"
          />
        </pattern>
      </defs>

      <rect
        x="12"
        y="12"
        width="232"
        height="232"
        rx="52"
        fill="url(#im-bg-grad)"
        stroke="#2d2d34"
        strokeWidth="2"
      />
      <rect x="12" y="12" width="232" height="232" rx="52" fill="url(#im-grid)" />

      <polygon points={plate()} fill="#26262e" stroke="#34343d" strokeWidth="2" />

      {/* Painted back to front, same rule as the renderer: far corner first. */}
      {BLOCKS.map(({ key, ...box }) => (
        <Box key={key} {...box} />
      ))}
    </svg>
  );
}

// Projection mirrors modules/map/iso.ts, scaled for a 256px tile.
const U = 30;
const OX = 128;
const OY = 156;

function pt(x: number, y: number, z: number): [number, number] {
  return [OX + (x - z) * U, OY + (x + z) * U * 0.5 - y * U * 0.62];
}

function poly(points: [number, number][]): string {
  return points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

function plate(): string {
  const e = 2.05;
  return poly([pt(-e, 0, -e), pt(e, 0, -e), pt(e, 0, e), pt(-e, 0, e)]);
}

type BoxSpec = {
  key: string;
  x: number;
  z: number;
  s: number;
  h: number;
  top: string;
  left: string;
  right: string;
};

const CORAL = { top: "#ff9878", left: "#f07253", right: "#c9533a" };
const SLATE = { top: "#8d8d9c", left: "#6d6d7c", right: "#4e4e5b" };
const DIM = { top: "#5c5c69", left: "#484852", right: "#33333c" };

const BLOCKS: BoxSpec[] = [
  { key: "a", x: -1.55, z: -1.55, s: 1.45, h: 1.05, ...SLATE },
  { key: "b", x: 0.1, z: -1.55, s: 1.45, h: 0.55, ...DIM },
  { key: "c", x: -1.55, z: 0.1, s: 1.45, h: 1.75, ...CORAL },
  { key: "d", x: 0.1, z: 0.1, s: 1.45, h: 0.85, ...SLATE },
];

function Box({ x, z, s, h, top, left, right }: Omit<BoxSpec, "key">) {
  const a = pt(x, h, z);
  const b = pt(x + s, h, z);
  const c = pt(x + s, h, z + s);
  const d = pt(x, h, z + s);
  const cB = pt(x + s, 0, z + s);
  const bB = pt(x + s, 0, z);
  const dB = pt(x, 0, z + s);
  return (
    <g>
      <polygon points={poly([d, c, cB, dB])} fill={left} />
      <polygon points={poly([b, c, cB, bB])} fill={right} />
      <polygon points={poly([a, b, c, d])} fill={top} />
    </g>
  );
}
