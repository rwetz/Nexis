// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The family's loader: the heptagram, drawn as one continuous stroke (the
 * {7/2} star the brand mark is built on), with a comet of light running
 * along its lines while the star turns slowly the other way.
 *
 * Vector and CSS-animated, so it is sharp at any interface scale and moves
 * at the display's refresh rate (60 or 120 fps), not in steps. Everything is
 * `currentColor`: it takes the colour of the text or button it sits in.
 * Under reduced motion the comet stops and only its brightness breathes, so
 * it still reads as busy without moving. The animation lives in globals.css
 * (`.nexis-loader`).
 */

import { cn } from "@/lib/utils";

/** The {7/2} heptagram on a 24-unit square, as one closed stroke. */
const STAR = "M12 2.5L21.26 14.11L7.88 20.56L4.57 6.08L19.43 6.08L16.12 20.56L2.74 14.11Z";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="Loading"
      data-slot="spinner"
      className={cn("nexis-loader size-4 shrink-0", className)}
      {...props}
    >
      <g className="nexis-loader-turn" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor">
        {/* pathLength=100 makes the dash lengths below percentages of the star. */}
        <path d={STAR} pathLength={100} strokeWidth={1.3} opacity={0.3} />
        <path d={STAR} pathLength={100} strokeWidth={1.8} opacity={0.5} className="nexis-loader-tail" />
        <path d={STAR} pathLength={100} strokeWidth={2.2} className="nexis-loader-head" />
      </g>
    </svg>
  );
}

export { Spinner };
