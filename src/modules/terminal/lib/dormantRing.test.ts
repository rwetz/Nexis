// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import { DormantRing } from "./dormantRing";

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (chunks: Uint8Array[]) =>
  chunks.map((c) => new TextDecoder().decode(c)).join("");

function drain(ring: DormantRing): Uint8Array[] {
  const out: Uint8Array[] = [];
  ring.drain((b) => out.push(b));
  return out;
}

describe("DormantRing", () => {
  it("replays pushed chunks in FIFO order and empties itself", () => {
    const ring = new DormantRing();
    ring.push(enc("hello "));
    ring.push(enc("world"));
    expect(dec(drain(ring))).toBe("hello world");
    expect(ring.byteLength()).toBe(0);
  });

  it("ignores empty pushes", () => {
    const ring = new DormantRing();
    ring.push(new Uint8Array(0));
    expect(ring.byteLength()).toBe(0);
    expect(dec(drain(ring))).toBe("");
  });

  it("drain on an empty ring writes nothing and is repeatable", () => {
    const ring = new DormantRing();
    expect(dec(drain(ring))).toBe("");
    ring.push(enc("x"));
    drain(ring);
    // A second drain after emptying must not replay anything.
    expect(dec(drain(ring))).toBe("");
  });

  it("interleaves push/drain cycles without carrying state over", () => {
    const ring = new DormantRing();
    ring.push(enc("a"));
    expect(dec(drain(ring))).toBe("a");
    ring.push(enc("b"));
    expect(dec(drain(ring))).toBe("b");
  });

  describe("byte cap eviction", () => {
    it("keeps only the newest bytes within the cap, dropping whole oldest chunks", () => {
      // byteCap 100; each push is 40 bytes → chunk 1 must be dropped once
      // total exceeds 100 with more than one chunk present.
      const ring = new DormantRing(100, 256);
      ring.push(enc("a".repeat(40)));
      ring.push(enc("b".repeat(40)));
      ring.push(enc("c".repeat(40)));

      expect(ring.byteLength()).toBeLessThanOrEqual(80 + 40); // two chunks max
      const text = dec(drain(ring));
      expect(text).toContain("c".repeat(40));
      expect(text).toContain("b".repeat(40));
      expect(text).not.toContain("a".repeat(40));
    });

    it("marks overflow and prepends a reset+notice exactly once on drain", () => {
      const ring = new DormantRing(10, 256);
      ring.push(enc("1234567890")); // == cap, kept
      ring.push(enc("abcdefghij")); // exceeds → first dropped
      const chunks = drain(ring);
      const text = dec(chunks);
      expect(text.startsWith("\x1bc\x1b[2m[nexis: dropped output during hibernation]")).toBe(
        true,
      );
      // Exactly one notice even if drained twice in a row (drain resets state).
      expect(text.match(/dropped output during hibernation/g)).toHaveLength(1);
      expect(dec(drain(ring))).toBe("");
    });

    it("a single push at or above the cap keeps its tail and resets the stream", () => {
      const ring = new DormantRing(8, 256);
      ring.push(enc("wxyz"));
      ring.push(enc("ABCDEFGHIJKL")); // ≥ cap on its own → replaced by tail

      const text = dec(drain(ring));
      expect(text.startsWith("\x1bc")).toBe(true); // terminal reset first…
      expect(text.endsWith("EFGHIJKL")).toBe(true); // …then the newest 8 bytes
      expect(text).not.toContain("wxyz");
    });
  });

  describe("chunk cap eviction", () => {
    it("drops oldest chunks when count exceeds the chunk cap", () => {
      const ring = new DormantRing(1024, 3);
      for (const c of ["one", "two", "three", "four"]) ring.push(enc(c));
      const text = dec(drain(ring));
      expect(text).not.toContain("one");
      expect(text).toContain("four");
      expect(ring.byteLength()).toBeLessThanOrEqual(4 + 5 + 3);
    });

    it("never evicts down to zero — at least one chunk survives", () => {
      const ring = new DormantRing(1024, 2);
      ring.push(enc("only"));
      // A single chunk must never be evicted regardless of caps.
      expect(dec(drain(ring))).toBe("only");
    });
  });
});
