// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MlBridgeHandlers } from "./engine-bridge";

const bridge = vi.hoisted(() => ({
  handlers: [] as MlBridgeHandlers[],
  nextSid: 40,
  /** What the fake engine answers to each stdin line. */
  answer: (_req: unknown): string => "",
  /** Emit `ready` before spawnServe resolves (the race headless.ts covers). */
  readyBeforeResolve: false,
  killed: [] as number[],
}));

vi.mock("./engine-bridge", () => {
  const emit = (sid: number, line: string) =>
    bridge.handlers.slice().forEach((h) => h.onProto({ sid, lines: [line] }));
  const ready = JSON.stringify({
    ev: "ready",
    template: "tabular",
    device: "cpu",
    meta: { features: ["ppg"], classes: ["0", "1"] },
  });
  return {
    subscribeMlEventsAttached: async (h: MlBridgeHandlers) => {
      bridge.handlers.push(h);
      return () => {
        bridge.handlers = bridge.handlers.filter((x) => x !== h);
      };
    },
    spawnServe: async () => {
      const sid = bridge.nextSid++;
      if (bridge.readyBeforeResolve) emit(sid, ready);
      else queueMicrotask(() => emit(sid, ready));
      return sid;
    },
    sendInfer: async (sid: number, req: unknown) => {
      queueMicrotask(() => emit(sid, bridge.answer(req)));
    },
    killRun: async (sid: number) => {
      bridge.killed.push(sid);
    },
  };
});

import { isHeadlessSid, withHeadlessSession } from "./headless";

const opts = { exe: "nexis-ml", projectDir: "/ws/goat", runId: "r1" };

describe("withHeadlessSession", () => {
  beforeEach(() => {
    bridge.handlers = [];
    bridge.killed = [];
    bridge.readyBeforeResolve = false;
    bridge.answer = (req) =>
      JSON.stringify({
        ev: "prediction",
        input: req,
        output: { label: "1", probs: { "0": 0.2, "1": 0.8 } },
      });
  });

  it("loads, answers requests, then stops the engine and unsubscribes", async () => {
    let sid = -1;
    const out = await withHeadlessSession(opts, async (s) => {
      expect(s.meta.features).toEqual(["ppg"]);
      sid = bridge.nextSid - 1;
      expect(isHeadlessSid(sid)).toBe(true);
      return s.infer({ input: { ppg: 30 } });
    });
    expect(out.output).toEqual({ label: "1", probs: { "0": 0.2, "1": 0.8 } });
    expect(bridge.killed).toEqual([sid]);
    expect(bridge.handlers).toHaveLength(0);
    // still registered while its exit event may be in flight
    expect(isHeadlessSid(sid)).toBe(true);
  });

  it("keeps a ready batch that lands before the spawn resolves", async () => {
    bridge.readyBeforeResolve = true;
    await expect(withHeadlessSession(opts, async (s) => s.template)).resolves.toBe("tabular");
  });

  it("turns an engine error into a rejection and still cleans up", async () => {
    bridge.answer = () => JSON.stringify({ ev: "error", msg: "feature mismatch" });
    await expect(
      withHeadlessSession(opts, (s) => s.infer({ input: {} })),
    ).rejects.toThrow("feature mismatch");
    expect(bridge.killed).toHaveLength(1);
  });

  it("serializes concurrent sessions", async () => {
    const order: string[] = [];
    const a = withHeadlessSession(opts, async () => {
      order.push("a-start");
      await new Promise((r) => setTimeout(r, 5));
      order.push("a-end");
    });
    const b = withHeadlessSession(opts, async () => {
      order.push("b");
    });
    await Promise.all([a, b]);
    expect(order).toEqual(["a-start", "a-end", "b"]);
  });
});
