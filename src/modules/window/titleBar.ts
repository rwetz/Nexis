// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Where the macOS traffic lights sit on each kind of Nexis window.
 *
 * Every window uses the overlay title bar: the native close, minimise and
 * zoom buttons float over our own header. Left alone, macOS puts them where
 * a stock 28pt title bar would have them, so on our 40pt header they sat
 * about 4pt above the header's icons. Each window moves them for its own
 * header with `centreTrafficLights` (backend: traffic_lights.rs). Tauri's
 * `trafficLightPosition` is not used: tao keeps re-applying it in native
 * fullscreen, where it pushes the buttons out of the reveal strip and leaves
 * no visible way out of fullscreen.
 *
 * `y` is the buttons' vertical centre, so it is half the bar height; the
 * backend measures where AppKit put them and moves them onto it, since that
 * offset differs between macOS versions. `x` is the close button's left
 * edge; the three buttons then end about 76pt in (they are 16pt on current macOS, 14pt before), and every
 * header leaves `pl-22` (88pt) clear for them: a 12pt gap to the first
 * control. `pl-20` (80pt), the old figure, left 5pt.
 *
 * `titleBar.test.ts` holds these heights to the headers that draw them.
 */

import { IS_MAC } from "@/lib/platform";
import { macOverlayTitleBar, placeTrafficLights } from "@/platform/windows";

export const TRAFFIC_LIGHT_X = 14;

/** Header heights in points, one per header style a window can draw. */
export const TITLE_BAR_HEIGHT = {
  /** The main window's `Header` (`h-10`) and a standard tool window. */
  standard: 40,
  /** A tool window with `header: "featured"` (Atlas). */
  featured: 56,
  /** nexis-design's `TitleBar` (`h-12`), which Epoch's embedded UI draws. */
  design: 48,
} as const;

export function trafficLightY(barHeight: number): number {
  return Math.round(barHeight / 2);
}

/** Window options for a macOS overlay title bar. */
export function macTitleBarOptions() {
  return macOverlayTitleBar();
}

/**
 * Centre this window's traffic lights on a header of `barHeight` points.
 * Each window calls it for itself once its header is up. Off macOS, or
 * outside Tauri (tests, a plain browser), it does nothing.
 */
export function centreTrafficLights(barHeight: number): void {
  if (!IS_MAC) return;
  void placeTrafficLights(TRAFFIC_LIGHT_X, trafficLightY(barHeight)).catch(() => {});
}
