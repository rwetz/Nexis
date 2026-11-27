// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The family's loader: the {7/2} heptagram the brand mark is built on, with
 * a comet of light sweeping round its lines while the star turns slowly the
 * other way.
 *
 * It moves on the compositor, not the main thread. The star is a CSS mask
 * and the comet a conic gradient turned with `transform`, so it keeps
 * moving while the page is busy (a big list rendering, a parse, a git
 * status on a huge repo). The old version animated the SVG stroke's dash
 * offset, which the browser repaints on the main thread, so it froze
 * exactly when it had something to say.
 *
 * Everything is `currentColor`: it takes the colour of the text or button
 * it sits in. Under reduced motion the sweep stops and the star breathes at
 * the caret cadence. The animation lives in globals.css (`.nexis-loader`).
 */

import { cn } from "@/lib/utils";

function Spinner({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      role="status"
      aria-label="Loading"
      data-slot="spinner"
      className={cn("nexis-loader size-4 shrink-0", className)}
      {...props}
    >
      <span className="nexis-loader-turn">
        <span className="nexis-loader-track" />
        <span className="nexis-loader-comet" />
      </span>
    </span>
  );
}

export { Spinner };
