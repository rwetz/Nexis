// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { beforeEach, describe, expect, it } from "vitest";
import {
  registerPendingSessionRestore,
  takePendingSessionRestore,
} from "./sessionRestore";

beforeEach(() => {
  // The registry is module-global; drain anything a prior test left.
  for (let id = 0; id < 1000; id++) takePendingSessionRestore(id);
});

describe("sessionRestore registry", () => {
  it("hands back the registered snapshot id exactly once", () => {
    registerPendingSessionRestore(7, "snap-abc");
    expect(takePendingSessionRestore(7)).toBe("snap-abc");
    // Consumed — a second take must not replay the snapshot into a
    // re-mounted leaf (that would duplicate the restore divider).
    expect(takePendingSessionRestore(7)).toBeNull();
  });

  it("returns null for never-registered leaves", () => {
    expect(takePendingSessionRestore(999)).toBeNull();
  });

  it("re-registration overwrites instead of queueing", () => {
    // Tab restore's builder runs more than once with deterministic ids —
    // the doc comment promises idempotency, and the latest id must win.
    registerPendingSessionRestore(3, "snap-first");
    registerPendingSessionRestore(3, "snap-second");
    expect(takePendingSessionRestore(3)).toBe("snap-second");
    expect(takePendingSessionRestore(3)).toBeNull();
  });

  it("keeps entries independent per leaf", () => {
    registerPendingSessionRestore(1, "snap-1");
    registerPendingSessionRestore(2, "snap-2");
    expect(takePendingSessionRestore(2)).toBe("snap-2");
    expect(takePendingSessionRestore(1)).toBe("snap-1");
  });
});
