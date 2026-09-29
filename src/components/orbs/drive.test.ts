import { describe, expect, it } from "vitest";
import { createOrbDrive, hexToRgb, springStep, targetVolumes } from "./drive";
import type { OrbVariant } from "./types";

const VARIANT: OrbVariant = {
  key: "test",
  label: "Test",
  note: "",
  themed: false,
  fragment: "",
  params: [
    { key: "size", label: "Size", min: 0, max: 2, default: 1 },
    { key: "spin", label: "Spin", min: 0, max: 4, default: 0.5, integrate: true },
  ],
  colors: [{ key: "tint", label: "Tint", default: "#ff0000" }],
  statePresets: { idle: { size: 1 }, thinking: { size: 1.5 }, speaking: { size: 99 } },
  stateColors: { speaking: { tint: "#0000ff" } },
};

const run = (seconds: number, step: (i: number) => Parameters<ReturnType<typeof createOrbDrive>["advance"]>[1], drive = createOrbDrive(VARIANT, 0)) => {
  let last = drive.advance(0, step(0));
  const frames = Math.round(seconds * 60);
  for (let i = 1; i <= frames; i++) last = drive.advance(1 / 60, step(i));
  return { last, drive };
};

describe("springStep", () => {
  it("settles on its target without overshooting", () => {
    let x = 0;
    let v = 0;
    let max = 0;
    for (let i = 0; i < 600; i++) {
      [x, v] = springStep(x, v, 1, 1 / 60);
      max = Math.max(max, x);
    }
    expect(x).toBeCloseTo(1, 4);
    expect(max).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("stays stable at a huge time step", () => {
    const [x] = springStep(0, 0, 1, 10);
    expect(Number.isFinite(x)).toBe(true);
    expect(x).toBeLessThanOrEqual(1);
  });
});

describe("createOrbDrive", () => {
  it("eases a param to the state's preset", () => {
    const { last } = run(4, () => ({ state: "thinking" }));
    expect(last.p_size as number).toBeCloseTo(1.5, 3);
  });

  it("clamps a preset to the param's declared range", () => {
    // speaking's preset asks for 99; the shader is written against [0, 2].
    const { last } = run(4, () => ({ state: "speaking" }));
    expect(last.p_size as number).toBeCloseTo(2, 3);
  });

  it("lets an explicit value win over the preset, still clamped", () => {
    const { last } = run(4, () => ({ state: "thinking", params: { size: -5 } }));
    expect(last.p_size as number).toBeCloseTo(0, 3);
  });

  it("switches state continuously, with no jump in any uniform", () => {
    const drive = createOrbDrive(VARIANT, 0);
    let prev = drive.advance(0, { state: "idle" });
    let maxJump = 0;
    for (let i = 0; i < 240; i++) {
      const state = i < 120 ? "idle" : "speaking";
      const next = { ...drive.advance(1 / 60, { state, baseColors: { tint: "#ff0000" } }) };
      if (i > 0) maxJump = Math.max(maxJump, Math.abs((next.p_size as number) - (prev.p_size as number)));
      prev = next;
    }
    // One frame of a spring toward a target 1 away moves far less than that.
    expect(maxJump).toBeLessThan(0.1);
  });

  it("accumulates an integrated param as a clock", () => {
    const drive = createOrbDrive(VARIANT, 0);
    const a = drive.advance(1 / 60, { state: "idle" }).p_spin as number;
    let b = a;
    for (let i = 0; i < 120; i++) b = drive.advance(1 / 60, { state: "idle" }).p_spin as number;
    expect(b).toBeGreaterThan(a);
  });

  it("starts on the first resolved colour, then eases to a state's own colour", () => {
    const drive = createOrbDrive(VARIANT, 0);
    const first = drive.advance(0, { state: "idle", baseColors: { tint: "#00ff00" } }).c_tint as number[];
    expect(first).toEqual([0, 1, 0]);
    const { last } = run(4, () => ({ state: "speaking", baseColors: { tint: "#00ff00" } }), drive);
    const [r, g, b] = last.c_tint as number[];
    expect(r).toBeCloseTo(0, 2);
    expect(g).toBeCloseTo(0, 2);
    expect(b).toBeCloseTo(1, 2);
  });

  it("reports the resolution it was given", () => {
    const drive = createOrbDrive(VARIANT, 0);
    drive.setResolution(88, 44);
    expect(drive.advance(0, { state: "idle" }).u_res).toEqual([88, 44]);
  });

  it("runs the flow clock faster while speaking than at idle", () => {
    const idle = run(3, () => ({ state: "idle" })).last.u_anim as number;
    const speaking = run(3, () => ({ state: "speaking" })).last.u_anim as number;
    expect(speaking).toBeGreaterThan(idle);
  });
});

describe("helpers", () => {
  it("targetVolumes are silent at idle and within 0..1 elsewhere", () => {
    expect(targetVolumes("idle", 5)).toEqual([0, 0.3]);
    for (let t = 0; t < 20; t += 0.37) {
      for (const s of ["thinking", "speaking"] as const) {
        for (const v of targetVolumes(s, t)) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("hexToRgb reads short and long hex, and falls back to white", () => {
    expect(hexToRgb("#f00")).toEqual([1, 0, 0]);
    expect(hexToRgb("#0000ff")).toEqual([0, 0, 1]);
    expect(hexToRgb("nope")).toEqual([1, 1, 1]);
  });
});
