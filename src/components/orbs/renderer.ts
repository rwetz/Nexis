// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * One orb on one canvas: a WebGL2 context, a full-screen triangle running the
 * variant's fragment shader, and a frame loop fed by `drive.ts`.
 *
 * shadercn's renderer does this on WebGPU. WebGL2 is used here because it is
 * what every webview Nexis ships in has: WebKitGTK (Linux) has no WebGPU and
 * WKWebView only gained it recently. It is the same stack as the animated
 * backgrounds (`components/ui/backgrounds/`), so no dependency is added.
 *
 * Two things ogl does not do that this has to:
 * - it falls back to WebGL1 silently, and the shaders are GLSL ES 3.00, so
 *   the context is checked;
 * - it only warns on a compile or link failure, so link status is checked,
 *   and `ready` rejects with the log instead of drawing nothing forever.
 */
import { Mesh, Program, Renderer, Triangle } from "ogl";
import { runRafLoopWhileVisible } from "@/components/ui/backgrounds/rafLoop";
import type { OrbDrive, DriveInput } from "./drive";
import { SHARED_UNIFORMS, type OrbUniforms, type OrbVariant } from "./types";

const MAX_STEP = 0.05;

const VERTEX = /* glsl */ `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const PRELUDE = /* glsl */ `#version 300 es
precision highp float;
uniform float u_time;
uniform float u_anim;
uniform float u_inputVol;
uniform float u_outputVol;
uniform vec2 u_res;
out vec4 fragColor;
`;

/** The complete fragment source a variant compiles to. */
export function fragmentSource(variant: OrbVariant): string {
  return PRELUDE + variant.fragment;
}

type Uniforms = Record<string, { value: number | number[] }>;

/**
 * Compile a variant on an existing ogl renderer. Throws with the driver's log
 * when the program does not link, since ogl itself only warns.
 */
export function buildOrbMesh(renderer: Renderer, variant: OrbVariant): { mesh: Mesh; uniforms: Uniforms } {
  const ctx = renderer.gl;
  const uniforms: Uniforms = {};
  for (const name of SHARED_UNIFORMS) uniforms[name] = { value: name === "u_res" ? [1, 1] : 0 };
  for (const p of variant.params) uniforms[`p_${p.key}`] = { value: p.default };
  for (const c of variant.colors) uniforms[`c_${c.key}`] = { value: [1, 1, 1] };
  const program = new Program(ctx, { vertex: VERTEX, fragment: fragmentSource(variant), uniforms, transparent: true });
  if (!ctx.getProgramParameter(program.program, ctx.LINK_STATUS)) {
    throw new Error(`${variant.key}: ${ctx.getProgramInfoLog(program.program) || "shader failed to compile"}`);
  }
  return { mesh: new Mesh(ctx, { geometry: new Triangle(ctx), program }), uniforms };
}

/** Copy one frame of drive output into the program's uniforms. */
export function applyFrame(uniforms: Uniforms, frame: OrbUniforms): void {
  for (const [name, value] of Object.entries(frame)) {
    const u = uniforms[name];
    if (u) u.value = value as number | number[];
  }
}

/** A WebGL2 ogl renderer on `canvas`, or null where WebGL2 is unavailable. */
export function createGl2Renderer(canvas: HTMLCanvasElement, preserveDrawingBuffer = false): Renderer | null {
  const renderer = new Renderer({
    canvas,
    webgl: 2,
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    preserveDrawingBuffer,
  });
  if (typeof WebGL2RenderingContext === "undefined" || !(renderer.gl instanceof WebGL2RenderingContext)) {
    renderer.gl.getExtension("WEBGL_lose_context")?.loseContext();
    return null;
  }
  return renderer;
}

export type OrbRendererOptions = {
  canvas: HTMLCanvasElement;
  variant: OrbVariant;
  drive: OrbDrive;
  /** Read once per frame, so the caller can change state without a rebuild. */
  input: () => DriveInput;
  maxDpr?: number;
  onFirstFrame?: () => void;
  /** The context was lost after starting; the caller shows its fallback. */
  onLost?: () => void;
};

export type OrbRenderer = { ready: Promise<void>; dispose: () => void };

export function createOrbRenderer({
  canvas,
  variant,
  drive,
  input,
  maxDpr = 2,
  onFirstFrame,
  onLost,
}: OrbRendererOptions): OrbRenderer {
  let disposed = false;
  let stopLoop: (() => void) | undefined;
  let resize: ResizeObserver | undefined;
  let intersect: IntersectionObserver | undefined;
  let gl: WebGL2RenderingContext | undefined;
  const onContextLost = (e: Event) => {
    e.preventDefault();
    if (!disposed) onLost?.();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    stopLoop?.();
    resize?.disconnect();
    intersect?.disconnect();
    canvas.removeEventListener("webglcontextlost", onContextLost);
    // Webviews cap live contexts (around 16 in Chromium) and evict the oldest
    // when a new one is created, so release this one now instead of waiting
    // for garbage collection. The listener is gone, so this is not reported.
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  };

  const ready = new Promise<void>((resolve, reject) => {
    // ogl's constructor calls setSize(300, 150), which writes inline
    // `width: 300px; height: 150px` onto the canvas and overrides whatever
    // sized it. Keep the caller's inline size and put it back; `fit` then
    // sizes only the backing store and never touches the style again.
    const styleWidth = canvas.style.width;
    const styleHeight = canvas.style.height;
    const renderer = createGl2Renderer(canvas);
    if (!renderer) {
      disposed = true;
      reject(new Error("WebGL2 is not available"));
      return;
    }
    canvas.style.width = styleWidth;
    canvas.style.height = styleHeight;
    // createGl2Renderer returned it, so it is WebGL2.
    gl = renderer.gl as WebGL2RenderingContext;
    canvas.addEventListener("webglcontextlost", onContextLost);

    let built: ReturnType<typeof buildOrbMesh>;
    try {
      built = buildOrbMesh(renderer, variant);
    } catch (e) {
      dispose();
      reject(e);
      return;
    }
    const { mesh, uniforms } = built;

    const fit = () => {
      // The app zooms with CSS `zoom`, which the backing store knows nothing
      // about. The ratio of the laid-out box to the untransformed one is the
      // zoom actually applied, so the canvas stays sharp at any app zoom.
      const box = canvas.getBoundingClientRect();
      const zoom = canvas.offsetWidth > 0 ? box.width / canvas.offsetWidth : 1;
      const dpr = Math.min(window.devicePixelRatio * zoom, maxDpr);
      const width = Math.max(1, canvas.offsetWidth);
      const height = Math.max(1, canvas.offsetHeight);
      // What `renderer.setSize` does, minus its inline style write.
      renderer.dpr = dpr;
      renderer.width = width;
      renderer.height = height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      drive.setResolution(canvas.width, canvas.height);
    };
    fit();

    let painted = false;
    const draw = (dt: number) => {
      applyFrame(uniforms, drive.advance(dt, input()));
      renderer.render({ scene: mesh });
      if (!painted) {
        painted = true;
        onFirstFrame?.();
      }
    };

    let visible = true;
    intersect = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
    });
    intersect.observe(canvas);
    resize = new ResizeObserver(fit);
    resize.observe(canvas);

    let last = 0;
    stopLoop = runRafLoopWhileVisible((t) => {
      const dt = last === 0 ? 0 : Math.min((t - last) / 1000, MAX_STEP);
      last = t;
      if (visible) draw(dt);
    });
    resolve();
  });

  return { ready, dispose };
}
