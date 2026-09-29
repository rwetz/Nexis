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
import { SHARED_UNIFORMS, type OrbVariant } from "./types";

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

export type OrbRendererOptions = {
  canvas: HTMLCanvasElement;
  variant: OrbVariant;
  drive: OrbDrive;
  /** Read once per frame, so the caller can change state without a rebuild. */
  input: () => DriveInput;
  maxDpr?: number;
  /** Draw one frame and stop (reduced motion, or a still gallery tile). */
  still?: boolean;
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
  still = false,
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
    const renderer = new Renderer({
      canvas,
      webgl: 2,
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
    });
    if (typeof WebGL2RenderingContext === "undefined" || !(renderer.gl instanceof WebGL2RenderingContext)) {
      dispose();
      reject(new Error("WebGL2 is not available"));
      return;
    }
    canvas.style.width = styleWidth;
    canvas.style.height = styleHeight;
    gl = renderer.gl;
    canvas.addEventListener("webglcontextlost", onContextLost);

    const uniforms: Record<string, { value: number | number[] }> = {};
    for (const name of SHARED_UNIFORMS) uniforms[name] = { value: name === "u_res" ? [1, 1] : 0 };
    for (const p of variant.params) uniforms[`p_${p.key}`] = { value: p.default };
    for (const c of variant.colors) uniforms[`c_${c.key}`] = { value: [1, 1, 1] };

    const ctx = renderer.gl;
    const program = new Program(ctx, { vertex: VERTEX, fragment: fragmentSource(variant), uniforms, transparent: true });
    if (!gl.getProgramParameter(program.program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program.program) || "shader failed to compile";
      dispose();
      reject(new Error(`${variant.key}: ${log}`));
      return;
    }
    const mesh = new Mesh(ctx, { geometry: new Triangle(ctx), program });

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
      const frame = drive.advance(dt, input());
      for (const [name, value] of Object.entries(frame)) {
        const u = uniforms[name];
        if (u) u.value = value as number | number[];
      }
      renderer.render({ scene: mesh });
      if (!painted) {
        painted = true;
        onFirstFrame?.();
      }
    };

    if (still) {
      // A still still has to look like its state, so let the springs settle
      // before the one frame is drawn.
      for (let i = 0; i < 90; i++) drive.advance(1 / 30, input());
      draw(1 / 30);
      resize = new ResizeObserver(() => {
        fit();
        draw(0);
      });
      resize.observe(canvas);
      resolve();
      return;
    }

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
