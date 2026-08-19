// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Backing-store scale for a `<canvas>` rendered inside the app shell.
 *
 * The usual `canvas.width = cssWidth * devicePixelRatio` is wrong here.
 * App zoom is CSS `zoom: var(--app-zoom)` on `.zoom-content` (pitfall #15),
 * and CSS zoom scales the element's *rendered* size on screen while leaving
 * `clientWidth` and `devicePixelRatio` alone. A canvas sized from `dpr` alone
 * is therefore under-resolved by exactly the zoom factor and renders soft —
 * subtly at 1.1, obviously at 1.5.
 *
 * Multiply the two. Use this everywhere a canvas sizes its backing store, and
 * re-run it on zoom changes: `--app-zoom` moves without any CSS-pixel layout
 * change, so a `ResizeObserver` alone never fires.
 */
export function canvasBackingScale(): number {
  const dpr = window.devicePixelRatio || 1;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(
    "--app-zoom",
  );
  const zoom = Number.parseFloat(raw);
  return dpr * (Number.isFinite(zoom) && zoom > 0 ? zoom : 1);
}
