// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Run `tick` on a requestAnimationFrame loop, suspended while the document
 * is hidden. Browsers throttle hidden rAF, but WebKitGTK does not reliably
 * stop it (and any GPU render on those ticks still burns power), so the
 * animated backgrounds gate explicitly — mirroring what SurfaceLayer's
 * `useDocumentHidden` already does for animated background images.
 *
 * Returns a dispose function that stops the loop and removes the listener.
 * Note: `t` (the rAF timestamp) jumps forward across a pause; loops that
 * integrate per-frame deltas should clamp `t - lastT`.
 */
export function runRafLoopWhileVisible(
  tick: (t: number) => void,
): () => void {
  let rafId = 0;
  let running = false;

  const loop = (t: number) => {
    rafId = requestAnimationFrame(loop);
    tick(t);
  };
  const start = () => {
    if (running) return;
    running = true;
    rafId = requestAnimationFrame(loop);
  };
  const stop = () => {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
  };
  const onVisibility = () => {
    if (document.hidden) stop();
    else start();
  };

  document.addEventListener("visibilitychange", onVisibility);
  if (!document.hidden) start();

  return () => {
    stop();
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
