import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(),
  listen: vi.fn(),
}));

import {
  MAX_SNAPSHOT_CHARS,
  deleteSessionSnapshot,
  gcSessionSnapshots,
  loadSessionSnapshot,
  saveSessionSnapshot,
} from "./snapshot-bridge";

beforeEach(() => mocks.invoke.mockReset());

it("keeps snapshot storage host-scoped and trims from the front", async () => {
  mocks.invoke.mockResolvedValue(undefined);
  await saveSessionSnapshot("session-1", `drop${"k".repeat(MAX_SNAPSHOT_CHARS)}`);
  const [command, args] = mocks.invoke.mock.calls[0] as [
    string,
    { id: string; data: string },
  ];
  expect(command).toBe("session_snapshot_save");
  expect(args.id).toBe("session-1");
  expect(args.data).toHaveLength(MAX_SNAPSHOT_CHARS);
  expect(args.data.startsWith("drop")).toBe(false);
});

it("routes load, delete, and gc through typed host commands", async () => {
  mocks.invoke.mockResolvedValueOnce("scrollback");
  await expect(loadSessionSnapshot("session-1")).resolves.toBe("scrollback");
  await deleteSessionSnapshot("session-1");
  await gcSessionSnapshots(["session-2"]);
  expect(mocks.invoke.mock.calls).toEqual([
    ["session_snapshot_load", { id: "session-1" }],
    ["session_snapshot_delete", { id: "session-1" }],
    ["session_snapshot_gc", { keep: ["session-2"] }],
  ]);
});
