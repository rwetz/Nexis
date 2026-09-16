import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ emit: vi.fn(), listen: vi.fn() }));

import { shareServer } from "./api";
import { shareCapability } from ".";

beforeEach(() => mocks.invoke.mockReset());

it("declares the module-owned share server capability", () => {
  expect(shareCapability).toMatchObject({ id: "share.http", panels: [] });
});

it("keeps share lifecycle calls host-scoped", async () => {
  mocks.invoke.mockResolvedValueOnce(4321).mockResolvedValue(undefined);
  await expect(
    shareServer.start({ html: "<p>x</p>", port: 0, bind: "127.0.0.1", token: "abc" }),
  ).resolves.toBe(4321);
  await shareServer.stop();
  expect(mocks.invoke.mock.calls).toEqual([
    [
      "http_share_start",
      { html: "<p>x</p>", port: 0, bind: "127.0.0.1", token: "abc" },
    ],
    ["http_share_stop", {}],
  ]);
});
