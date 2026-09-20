// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * A slow Perlin wave field, pixelated and posterised through an ordered
 * (Bayer) dither — the retro 1-bit look.
 *
 * The reference implementation is three.js + @react-three/fiber +
 * @react-three/postprocessing + postprocessing: a render target for the wave
 * and a second pass for the dither. This port folds both into one `ogl`
 * fragment shader on a full-screen triangle, which is what Aurora, Particles,
 * Threads and DarkVeil already do. That keeps the app on a single WebGL
 * vendor instead of taking four new runtime dependencies to draw one
 * background — and the two-pass structure bought nothing here, because the
 * "post" pass has no scene to read back: it only needs the luminance the
 * first pass just computed.
 *
 * Both effects are therefore computed per-fragment:
 *   - pixelation by snapping gl_FragCoord to a uPixelSize lattice before
 *     sampling the noise, so the wave is genuinely low-resolution rather
 *     than a smooth field with a mosaic drawn over it;
 *   - the dither by offsetting luminance with a Bayer threshold and then
 *     quantising to uColorSteps levels.
 *
 * The field is opaque and carries its own ground: luminance mixes between
 * `background` and `color` rather than becoming alpha. Using luminance as
 * alpha (the first version) dissolved every dark band into the page, so the
 * dither read as haze rather than as an image.
 */

import { Color, Mesh, Program, Renderer, Triangle } from "ogl";
import { useEffect, useRef } from "react";
import { runRafLoopWhileVisible } from "./rafLoop";

const vertexShader = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform float iTime;
uniform vec2 iResolution;
uniform vec3 uWaveColor;
uniform vec3 uBackground;
uniform float uWaveSpeed;
uniform float uWaveFrequency;
uniform float uWaveAmplitude;
uniform float uColorSteps;
uniform float uPixelSize;
uniform vec2 uMouse;
uniform float uMouseRadius;
uniform float uMouseEnabled;

// Same Perlin as Threads.tsx, so the two animated fields share a noise
// character rather than each bringing its own.
float Perlin2D(vec2 P) {
    vec2 Pi = floor(P);
    vec4 Pf_Pfmin1 = P.xyxy - vec4(Pi, Pi + 1.0);
    vec4 Pt = vec4(Pi.xy, Pi.xy + 1.0);
    Pt = Pt - floor(Pt * (1.0 / 71.0)) * 71.0;
    Pt += vec2(26.0, 161.0).xyxy;
    Pt *= Pt;
    Pt = Pt.xzxz * Pt.yyww;
    vec4 hash_x = fract(Pt * (1.0 / 951.135664));
    vec4 hash_y = fract(Pt * (1.0 / 642.949883));
    vec4 grad_x = hash_x - 0.49999;
    vec4 grad_y = hash_y - 0.49999;
    vec4 grad_results = inversesqrt(grad_x * grad_x + grad_y * grad_y)
        * (grad_x * Pf_Pfmin1.xzxz + grad_y * Pf_Pfmin1.yyww);
    grad_results *= 1.4142135623730950;
    vec2 blend = Pf_Pfmin1.xy * Pf_Pfmin1.xy * Pf_Pfmin1.xy
               * (Pf_Pfmin1.xy * (Pf_Pfmin1.xy * 6.0 - 15.0) + 10.0);
    vec4 blend2 = vec4(blend, vec2(1.0 - blend));
    return dot(grad_results, blend2.zxzx * blend2.wwyy);
}

// Four octaves, each half the amplitude and twice the frequency.
float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 1.0;
    float freq = 1.0;
    for (int i = 0; i < 4; i++) {
        sum += Perlin2D(p * freq) * amp;
        amp *= 0.5;
        freq *= 2.0;
    }
    return sum;
}

// Ordered-dither thresholds, built by recursion rather than an indexed
// lookup: GLSL ES 1.0 cannot index a const array with a computed value,
// and this formulation is exact for the 8x8 Bayer matrix.
float bayer2(vec2 a) {
    a = floor(a);
    return fract(a.x / 2.0 + a.y * a.y * 0.75);
}
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

void main() {
    // Snap to the pixel lattice BEFORE sampling, so the wave is actually
    // computed at low resolution instead of being mosaicked afterwards.
    vec2 cell = floor(gl_FragCoord.xy / uPixelSize);
    vec2 snapped = cell * uPixelSize;

    // Aspect-corrected, origin-centred coordinates.
    vec2 p = (snapped - 0.5 * iResolution) / iResolution.y;

    float t = iTime * uWaveSpeed;
    float wave = fbm(p * uWaveFrequency + vec2(t, t * 0.6)) * uWaveAmplitude;

    // The pointer lifts the field locally, with a smooth falloff.
    if (uMouseEnabled > 0.5) {
        vec2 m = (uMouse - 0.5 * iResolution) / iResolution.y;
        float d = distance(p, m);
        wave += (1.0 - smoothstep(0.0, uMouseRadius, d)) * 0.5;
    }

    float lum = clamp(wave * 0.5 + 0.5, 0.0, 1.0);

    // Ordered dither: nudge by the cell's threshold, then posterise. The
    // threshold is scaled by the step size so it spans exactly one band.
    float threshold = bayer8(cell) - 0.5;
    lum = clamp(lum + threshold / uColorSteps, 0.0, 1.0);
    lum = floor(lum * uColorSteps + 0.5) / uColorSteps;

    // Mix toward the wave colour over the plate, rather than multiplying the
    // colour by luminance and using that as alpha. The old form made every
    // dark band transparent, so the field dissolved into the page instead of
    // reading as an image with its own ground.
    gl_FragColor = vec4(mix(uBackground, uWaveColor, lum), 1.0);
}
`;

type Props = {
  /** Wave colour, as linear 0..1 RGB. */
  color?: readonly [number, number, number];
  /** Ground the field is drawn over, as linear 0..1 RGB. */
  background?: readonly [number, number, number];
  waveSpeed?: number;
  waveFrequency?: number;
  waveAmplitude?: number;
  /** Quantisation levels. Lower is chunkier; 2 is true 1-bit. */
  colorSteps?: number;
  /** Side of one output pixel, in device pixels. */
  pixelSize?: number;
  disableAnimation?: boolean;
  enableMouseInteraction?: boolean;
  mouseRadius?: number;
  opacity?: number;
};

/**
 * Defaults are the settings dialled in in BG Studio, kept verbatim so the
 * shipped look matches what was signed off:
 * wave #808080 on #000000, intensity 40, amplitude 0.08, frequency 10,
 * speed 0.1, mouse interaction on at radius 0.3.
 */
// Module constants, NOT inline defaults. An inline `color = [0.5, 0.5, 0.5]`
// allocates a fresh array on every render, and this component's effect
// depends on its settings — so the identity change tore the GL context down
// and rebuilt it every render, which is why the background rendered nothing
// at all. The effect below depends on the channels, never on array identity.
const DEFAULT_COLOR: readonly [number, number, number] = [0.502, 0.502, 0.502];
const DEFAULT_BACKGROUND: readonly [number, number, number] = [0, 0, 0];

export function DitherBackground({
  color = DEFAULT_COLOR,
  background = DEFAULT_BACKGROUND,
  waveSpeed = 0.1,
  waveFrequency = 10,
  waveAmplitude = 0.08,
  colorSteps = 40,
  pixelSize = 3,
  disableAnimation = false,
  enableMouseInteraction = true,
  mouseRadius = 0.3,
  opacity = 1,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new Renderer({ alpha: true });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    container.appendChild(gl.canvas);

    Object.assign((gl.canvas as HTMLCanvasElement).style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
    });

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        iTime: { value: 0 },
        iResolution: {
          value: new Float32Array([gl.canvas.width, gl.canvas.height]),
        },
        uWaveColor: { value: new Color(color[0], color[1], color[2]) },
        uBackground: {
          value: new Color(background[0], background[1], background[2]),
        },
        uWaveSpeed: { value: waveSpeed },
        uWaveFrequency: { value: waveFrequency },
        uWaveAmplitude: { value: waveAmplitude },
        uColorSteps: { value: Math.max(2, colorSteps) },
        uPixelSize: { value: Math.max(1, pixelSize) },
        uMouse: { value: new Float32Array([0, 0]) },
        uMouseRadius: { value: mouseRadius },
        uMouseEnabled: { value: enableMouseInteraction ? 1 : 0 },
      },
    });

    const mesh = new Mesh(gl, { geometry, program });
    const uniforms = program.uniforms as Record<string, { value: unknown }>;

    const resize = () => {
      const { clientWidth, clientHeight } = container;
      // Zero-sized container: nothing useful to draw, and setting a 0x0
      // drawing buffer makes the GL context unusable afterwards.
      if (clientWidth === 0 || clientHeight === 0) return;
      renderer.setSize(clientWidth, clientHeight);
      const res = uniforms.iResolution.value as Float32Array;
      res[0] = gl.canvas.width;
      res[1] = gl.canvas.height;
    };
    // A ResizeObserver, not just `window.resize`. This component is lazily
    // imported, so it can mount and measure BEFORE its container has been
    // laid out — `clientWidth` is then 0, the canvas is 0x0, and nothing
    // ever recovers because no window resize follows. That is what made the
    // background render as nothing at all.
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    window.addEventListener("resize", resize);
    resize();

    // Pointer position is recorded here and read once per frame; the shader
    // wants device pixels with a bottom-left origin, which is gl_FragCoord's
    // space, so the Y is flipped on the way in.
    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const dpr = gl.canvas.width / Math.max(1, rect.width);
      const m = uniforms.uMouse.value as Float32Array;
      m[0] = (e.clientX - rect.left) * dpr;
      m[1] = (rect.height - (e.clientY - rect.top)) * dpr;
    };
    if (enableMouseInteraction) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
    }

    // A frozen field still has to be drawn once; `disableAnimation` stops the
    // clock, it does not mean "render nothing".
    if (disableAnimation) {
      renderer.render({ scene: mesh });
    }
    const stopLoop = disableAnimation
      ? () => {}
      : runRafLoopWhileVisible((t) => {
          uniforms.iTime.value = t * 0.001;
          renderer.render({ scene: mesh });
        });

    return () => {
      stopLoop();
      observer.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      if (container.contains(gl.canvas)) container.removeChild(gl.canvas);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
    // Channels, not the arrays: see DEFAULT_COLOR above. Depending on the
    // array identity re-created the renderer on every render.
  }, [
    color[0],
    color[1],
    color[2],
    background[0],
    background[1],
    background[2],
    waveSpeed,
    waveFrequency,
    waveAmplitude,
    colorSteps,
    pixelSize,
    disableAnimation,
    enableMouseInteraction,
    mouseRadius,
  ]);

  return (
    <div
      aria-hidden
      ref={containerRef}
      // `absolute`, not `fixed`: this fills the welcome screen, which is a
      // pane inside the layout, not an overlay across the window. Matches
      // DarkVeil, the background it sits beside in the rotation.
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        opacity,
        transition: "opacity 200ms ease-out",
      }}
    />
  );
}
