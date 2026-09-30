// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Still orbs, rendered one at a time on a single shared WebGL2 context and
 * handed out as PNG data URLs.
 *
 * Webviews keep about 16 live WebGL contexts and evict the oldest past that.
 * A gallery of 26 orbs that each kept a context for its still frame would
 * evict its own tiles (and the live orb). Here every still frame, however
 * many, costs one context, and results are cached, so reopening the gallery
 * redraws nothing.
 */
import type { Mesh, Renderer } from "ogl";
import { createOrbDrive } from "./drive";
import { applyFrame, buildOrbMesh, createGl2Renderer } from "./renderer";
import type { OrbState, OrbVariant } from "./types";

type Built = ReturnType<typeof buildOrbMesh>;

let canvas: HTMLCanvasElement | null = null;
let renderer: Renderer | null = null;
const meshes = new Map<string, Built | Error>();
const cache = new Map<string, Promise<string>>();
let queue: Promise<unknown> = Promise.resolve();

function reset() {
  renderer = null;
  canvas = null;
  meshes.clear();
  // Cached images stay valid; only rendering state is gone.
}

function context(): Renderer {
  if (renderer) return renderer;
  canvas = document.createElement("canvas");
  // preserveDrawingBuffer so toDataURL reads the frame just drawn.
  const r = createGl2Renderer(canvas, true);
  if (!r) throw new Error("WebGL2 is not available");
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    reset();
  });
  renderer = r;
  return r;
}

function meshFor(r: Renderer, variant: OrbVariant): Built {
  let m = meshes.get(variant.key);
  if (!m) {
    try {
      m = buildOrbMesh(r, variant);
    } catch (e) {
      m = e instanceof Error ? e : new Error(String(e));
    }
    meshes.set(variant.key, m);
  }
  if (m instanceof Error) throw m;
  return m;
}

/**
 * A settled frame of `variant` in `state`, `px` device pixels square. The
 * springs run for three simulated seconds first, so a still looks like its
 * state rather than like the default it eased away from.
 */
export function snapshotOrb(
  variant: OrbVariant,
  state: OrbState,
  baseColors: Record<string, string>,
  px: number,
): Promise<string> {
  const size = Math.max(8, Math.round(px));
  const key = `${variant.key}|${state}|${size}|${JSON.stringify(baseColors)}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const job = queue.then(() => {
    const r = context();
    const { mesh, uniforms }: { mesh: Mesh; uniforms: Built["uniforms"] } = meshFor(r, variant);
    r.dpr = 1;
    r.width = size;
    r.height = size;
    canvas!.width = size;
    canvas!.height = size;
    const drive = createOrbDrive(variant, 7);
    drive.setResolution(size, size);
    const input = { state, baseColors };
    for (let i = 0; i < 90; i++) drive.advance(1 / 30, input);
    applyFrame(uniforms, drive.advance(1 / 30, input));
    r.render({ scene: mesh });
    return canvas!.toDataURL("image/png");
  });
  // The queue must survive a failed job, and a failure must not be cached.
  queue = job.catch(() => undefined);
  cache.set(key, job);
  job.catch(() => cache.delete(key));
  return job;
}
