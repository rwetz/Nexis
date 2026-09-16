import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ emit: vi.fn(), listen: vi.fn() }));

import { webHttp } from "./api";

beforeEach(() => mocks.invoke.mockReset());

it("routes human-authored HTTP requests through the dedicated host command", async () => {
  mocks.invoke.mockResolvedValue({
    status: 200,
    statusText: "OK",
    headers: {},
    body: [],
    elapsedMs: 1,
    finalUrl: "http://localhost:3000/",
  });
  await webHttp.send({
    url: "http://localhost:3000/",
    method: "GET",
    headers: {},
    body: null,
    timeoutMs: 30_000,
  });
  expect(mocks.invoke).toHaveBeenCalledWith("http_send", {
    url: "http://localhost:3000/",
    method: "GET",
    headers: {},
    body: null,
    timeoutMs: 30_000,
  });
});
