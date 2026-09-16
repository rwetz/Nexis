import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  channels: [] as Array<{ onmessage: ((value: unknown) => void) | null }>,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
  Channel: class {
    onmessage: ((value: unknown) => void) | null = null;
    constructor() {
      mocks.channels.push(this);
    }
  },
}));
vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(),
  listen: vi.fn(),
}));

import { startHttpStream } from "./http-stream";
import { createSecretStore } from "./secrets";
import { auditAgentCommand } from "@/modules/ai/lib/audit";

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.channels.length = 0;
});

describe("AI native platform services", () => {
  it("keeps keychain calls host-scoped and binds the service name", async () => {
    mocks.invoke.mockResolvedValueOnce("secret");
    const store = createSecretStore("nexis.ai");
    await expect(store.get("openai")).resolves.toBe("secret");
    expect(mocks.invoke).toHaveBeenCalledWith("secrets_get", {
      service: "nexis.ai",
      account: "openai",
    });

    await store.set("openai", "trimmed-by-caller");
    expect(mocks.invoke).toHaveBeenLastCalledWith("secrets_set", {
      service: "nexis.ai",
      account: "openai",
      password: "trimmed-by-caller",
    });
    expect(() => createSecretStore(" ")).toThrow("must not be empty");
  });

  it("owns the Tauri channel and forwards typed stream events", async () => {
    mocks.invoke.mockResolvedValue(undefined);
    const receive = vi.fn();
    await startHttpStream(
      {
        url: "https://example.test/v1",
        method: "POST",
        headers: { authorization: "redacted" },
        body: [1, 2, 3],
        allowPrivateNetwork: false,
      },
      receive,
    );
    expect(mocks.channels).toHaveLength(1);
    expect(mocks.invoke).toHaveBeenCalledWith(
      "ai_http_stream",
      expect.objectContaining({
        url: "https://example.test/v1",
        method: "POST",
        allowPrivateNetwork: false,
        onEvent: mocks.channels[0],
      }),
    );
    mocks.channels[0].onmessage?.({ kind: "chunk", bytes: [4, 5] });
    expect(receive).toHaveBeenCalledWith({ kind: "chunk", bytes: [4, 5] });
  });

  it("keeps command auditing best-effort and host-scoped", async () => {
    mocks.invoke.mockResolvedValue(undefined);
    auditAgentCommand({ kind: "run", command: "git status" });
    expect(mocks.invoke).toHaveBeenCalledWith("ai_audit_append", {
      entry: { kind: "run", command: "git status" },
    });

    mocks.invoke.mockImplementation(() => {
      throw new Error("not in a Tauri webview");
    });
    expect(() => auditAgentCommand({ kind: "blocked" })).not.toThrow();
  });
});
