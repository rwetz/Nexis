import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(),
  listen: vi.fn(),
}));

import { lsp } from "./api";
import { lspCapability } from ".";

beforeEach(() => mocks.invoke.mockReset());

it("declares the panel-less editor integration capability", () => {
  expect(lspCapability).toMatchObject({ id: "editor.lsp", panels: [] });
});

it("keeps the existing LSP server protocol host-scoped", async () => {
  mocks.invoke.mockResolvedValueOnce(7).mockResolvedValue(undefined);
  await expect(
    lsp.start({
      serverCmd: "rust-analyzer",
      serverArgs: [],
      workspaceRoot: "C:/repo",
      initializationOptions: null,
    }),
  ).resolves.toBe(7);
  await lsp.notify(7, "textDocument/didClose", { uri: "file:///a.rs" });
  await lsp.stop(7);
  expect(mocks.invoke.mock.calls).toEqual([
    [
      "lsp_start",
      {
        serverCmd: "rust-analyzer",
        serverArgs: [],
        workspaceRoot: "C:/repo",
        initializationOptions: null,
      },
    ],
    [
      "lsp_notify",
      {
        sessionId: 7,
        method: "textDocument/didClose",
        params: { uri: "file:///a.rs" },
      },
    ],
    ["lsp_stop", { sessionId: 7 }],
  ]);
});
