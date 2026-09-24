// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Elapsed-time formatting, shared by everything that shows a clock ticking
 * on work in progress.
 *
 * One implementation on purpose. This started in ML Lab, and a second copy
 * appeared in the status-bar process chip the moment a second feature needed
 * the same thing -- which is how two surfaces in one app end up disagreeing
 * about whether three hours reads as `3h 12m` or `3:12:45`. The ML form won
 * because it was already shipped and tested; `ml/lib/friendly.ts` re-exports
 * this so its own callers and tests did not have to move.
 */

/**
 * `m:ss` under an hour, `Hh Mm` above it.
 *
 * The switch is deliberate: seconds matter while you are watching something
 * finish, and stop mattering once it has been running long enough that the
 * hour is the news.
 */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}
