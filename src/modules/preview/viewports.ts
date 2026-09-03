// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Device viewports for the side-by-side preview, and the arithmetic that fits
 * them into the pane.
 *
 * The sizes are CSS pixels — the number a media query actually sees — not
 * physical device pixels. Getting that backwards is the classic mistake here:
 * an iPhone 15's panel is 1179 physical pixels wide and every `@media` in the
 * world reads it as 393, so a preview built on the physical number tests a
 * layout nobody will ever see.
 *
 * Scaling is done with `transform: scale()`, never CSS `zoom`. Both shrink the
 * box; only `transform` keeps hit-testing correct, which is the same defect
 * pitfall #15 documents for CodeMirror. An iframe you cannot click accurately
 * is not a preview.
 */

export type Viewport = {
  id: string;
  label: string;
  /** CSS pixels — what a media query sees. */
  width: number;
  height: number;
};

/** Phone, tablet, laptop. Three is the most that stays legible side by side. */
export const VIEWPORTS: readonly Viewport[] = [
  { id: "phone", label: "Phone", width: 390, height: 844 },
  { id: "tablet", label: "Tablet", width: 820, height: 1180 },
  { id: "desktop", label: "Desktop", width: 1440, height: 900 },
];

export type ViewportLayout = {
  /** Uniform scale applied to every frame, so they stay comparable. */
  scale: number;
  /** Rendered footprint of each frame, in order. */
  boxes: { viewport: Viewport; width: number; height: number }[];
};

/** Gap between frames and the padding around them, in rendered pixels. */
export const VIEWPORT_GAP = 16;

/**
 * Fit the chosen viewports into the available box.
 *
 * **One scale for all of them, not one each.** Scaling each frame to fill its
 * own column would render a 390px phone and a 1440px desktop at the same
 * on-screen width, which destroys the only thing a side-by-side view is for:
 * seeing how much room each device actually has. The phone must look small.
 *
 * The scale is capped at 1 so a narrow selection is never blown up past its
 * true size — a phone frame at 2x would misrepresent text size, which is
 * usually the thing being checked.
 */
export function layoutViewports(
  containerWidth: number,
  containerHeight: number,
  viewports: readonly Viewport[],
  gap: number = VIEWPORT_GAP,
): ViewportLayout {
  if (viewports.length === 0 || containerWidth <= 0 || containerHeight <= 0) {
    return { scale: 1, boxes: [] };
  }

  // Gaps are *rendered* pixels and are not scaled, so they come off the
  // container before the ratio is taken. Folding them into the scaled total
  // instead lets the frames overflow, by exactly the gap width times
  // (1 - scale) — small enough to look like a rounding artefact and large
  // enough to clip the last frame.
  const contentWidth = viewports.reduce((sum, v) => sum + v.width, 0);
  const tallest = Math.max(...viewports.map((v) => v.height));

  const availableWidth = containerWidth - gap * (viewports.length + 1);
  const availableHeight = containerHeight - gap * 2;
  if (availableWidth <= 0 || availableHeight <= 0) {
    return { scale: 1, boxes: [] };
  }

  const scale = Math.min(1, availableWidth / contentWidth, availableHeight / tallest);

  return {
    scale,
    boxes: viewports.map((viewport) => ({
      viewport,
      width: viewport.width * scale,
      height: viewport.height * scale,
    })),
  };
}

/** Look up viewports by id, dropping ids this build does not know. */
export function viewportsById(ids: readonly string[]): Viewport[] {
  return ids
    .map((id) => VIEWPORTS.find((v) => v.id === id))
    .filter((v): v is Viewport => v !== undefined);
}
