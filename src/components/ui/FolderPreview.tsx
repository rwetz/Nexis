// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * A folder that opens on hover and fans its contents out above itself.
 *
 * Replaces the earlier click-to-open AnimatedFolder. Three real differences,
 * not just a restyle:
 *
 *  - It opens on hover. The old one only reacted to a click, which on a
 *    decorative empty-state illustration asked the user to discover an
 *    interaction that leads nowhere. Hover is the affordance that matches
 *    what it actually is.
 *  - The cover has depth: it rotates about its bottom edge in a perspective
 *    container, so it reads as a lid lifting rather than as a skewed
 *    rectangle. The old version faked this with two mirrored `skew()` halves,
 *    which broke apart visually at any size above ~1.5.
 *  - The cover carries semantic marks from the icon layer, so the
 *    illustration is themed like everything else instead of being three
 *    untinted rectangles.
 *
 * Still deliberately `aria-hidden`: it is decoration, it performs no app
 * action, and making it focusable would add a tab stop that does nothing.
 */

import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/lib/utils";
import { m, useReducedMotion } from "motion/react";
import * as React from "react";

/** Preview sheets drawn inside the folder. More than three stops reading. */
const MAX_SHEETS = 3;

/** Resting marks on the cover. Generic "things a folder holds". */
const COVER_MARKS: IconName[] = ["file-code", "git-branch", "terminal"];

/** Where each sheet lands when the folder is open. Fixed art direction. */
const OPEN_POSE = [
  { x: "-62%", y: "-74%", rotate: -14 },
  { x: "-38%", y: "-84%", rotate: 3 },
  { x: "-14%", y: "-70%", rotate: 15 },
] as const;

function clampChannel(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return [82, 39, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${((1 << 24) | (clampChannel(r) << 16) | (clampChannel(g) << 8) | clampChannel(b))
    .toString(16)
    .slice(1)}`;
}

/** Multiply toward black. `amount` 0..1. */
function darken(hex: string, amount: number): string {
  const [r, g, b] = parseHex(hex);
  return toHex([r * (1 - amount), g * (1 - amount), b * (1 - amount)]);
}

/** Mix toward white. `ratio` 0 = white, 1 = the colour itself. */
function towardWhite(hex: string, ratio: number): string {
  const [r, g, b] = parseHex(hex);
  return toHex([
    255 * (1 - ratio) + r * ratio,
    255 * (1 - ratio) + g * ratio,
    255 * (1 - ratio) + b * ratio,
  ]);
}

type Props = {
  /** Folder colour. Pass the theme's folder accent. */
  color?: string;
  /** Uniform scale. 1 renders the folder at 100x80 CSS pixels. */
  size?: number;
  /** Content drawn on the sheets, front-most last. Up to three are used. */
  items?: React.ReactNode[];
  /** Caption below the folder. */
  label?: string;
  className?: string;
};


/** Module-scope default: a fresh `[]` per render would re-run the memo below. */
const NO_ITEMS: React.ReactNode[] = [];
export function FolderPreview({
  color = "#5227FF",
  size = 1,
  items = NO_ITEMS,
  label,
  className,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const reduceMotion = useReducedMotion();

  const back = darken(color, 0.16);
  const sheetTints = [
    towardWhite(color, 0.2),
    towardWhite(color, 0.13),
    towardWhite(color, 0.07),
  ];

  const sheets = React.useMemo(() => {
    const out: React.ReactNode[] = items.slice(0, MAX_SHEETS);
    while (out.length < MAX_SHEETS) out.push(null);
    return out;
  }, [items]);

  // Reduced motion keeps the state change (the folder still opens) and drops
  // the spring, matching how the rest of the app treats decoration.
  const spring = reduceMotion
    ? { duration: 0 }
    : ({ type: "spring", stiffness: 260, damping: 24 } as const);

  return (
    <div aria-hidden="true" className={cn("select-none", className)}>
      {/* Perspective lives here, on the pieces' own parent, and there is no
          `preserve-3d`. With 3D sorting on, the browser orders the lid and the
          sheets by depth rather than z-index, so any moment the lid sat even
          slightly behind the sheets' plane (a spring overshooting past flat
          on the way closed) painted the sheets over the cover. Flattened,
          z-index decides: the lid always covers the sheets, and it still
          swings in perspective. */}
      <div
        role="presentation"
        className="relative"
        style={{
          width: 100 * size,
          height: 80 * size,
          perspective: 620,
        }}
        onPointerEnter={() => setOpen(true)}
        onPointerLeave={() => setOpen(false)}
      >
        {/* Back panel, plus the tab that makes the silhouette a folder. */}
        <m.div
          className="absolute inset-0 rounded-[10px] rounded-tl-none"
          style={{ backgroundColor: back }}
          animate={{ y: open ? -6 * size : 0 }}
          transition={spring}
        >
          <span
            className="absolute bottom-[98%] left-0 h-[10px] w-[30px] rounded-t-[5px]"
            style={{
              backgroundColor: back,
              height: 10 * size,
              width: 30 * size,
            }}
          />
        </m.div>

        {/* Sheets. Tucked inside when closed, fanned above when open. */}
        {sheets.map((item, i) => (
          <m.div
            key={i}
            className="absolute bottom-[10%] left-1/2 z-20 overflow-hidden rounded-[8px] shadow-sm"
            style={{
              backgroundColor: sheetTints[i],
              width: `${70 + i * 10}%`,
              // Ruled texture, so an empty sheet still reads as paper.
              backgroundImage:
                "repeating-linear-gradient(transparent, transparent 11px, rgba(0,0,0,0.07) 11px, rgba(0,0,0,0.07) 12px)",
            }}
            animate={
              open
                ? {
                    x: OPEN_POSE[i].x,
                    y: OPEN_POSE[i].y,
                    rotate: OPEN_POSE[i].rotate,
                    height: `${74 - i * 2}%`,
                  }
                : {
                    x: "-50%",
                    y: "8%",
                    rotate: 0,
                    height: `${80 - i * 10}%`,
                  }
            }
            transition={
              reduceMotion ? { duration: 0 } : { ...spring, delay: i * 0.03 }
            }
          >
            {item}
          </m.div>
        ))}

        {/* Cover. Rotates about its bottom edge, which is what makes this a
            lid rather than a skew. */}
        <m.div
          className="absolute inset-0 z-30 flex items-end gap-1.5 rounded-[10px] rounded-tl-[5px] p-2"
          style={{
            backgroundColor: color,
            transformOrigin: "bottom center",
          }}
          animate={{ rotateX: open ? -42 : 0, y: open ? -6 * size : 0 }}
          // Critically damped: a lid that overshoots "closed" swings through
          // the folder for a frame. The sheets keep their bouncier spring.
          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 34 }}
        >
          {COVER_MARKS.map((name) => (
            <Icon
              key={name}
              name={name}
              size="xs"
              className="opacity-40"
              style={{ color: towardWhite(color, 0.05) }}
            />
          ))}
        </m.div>
      </div>

      {label && (
        <div className="mt-2 text-center text-xs text-muted-foreground">
          {label}
        </div>
      )}
    </div>
  );
}
