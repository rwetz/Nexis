import { describe, expect, it, vi } from "vitest";
import { checkLocalModel } from "./modelCheck";

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );

const ollamaModels = {
  object: "list",
  data: [{ id: "gpt-oss:20b-q3_k_m", object: "model", owned_by: "library" }],
};

describe("checkLocalModel", () => {
  it("finds the configured model in GET /models", async () => {
    const f = vi.fn(() => json(ollamaModels));
    const r = await checkLocalModel(
      "http://localhost:11434/v1/",
      " gpt-oss:20b-q3_k_m ",
      f as unknown as typeof fetch,
    );
    expect(r).toEqual({ kind: "ok" });
    expect(f).toHaveBeenCalledWith(
      "http://localhost:11434/v1/models",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("reports a model id the server doesn't serve, with what it does", async () => {
    const r = await checkLocalModel(
      "http://localhost:11434/v1",
      "gpt-oss:20b",
      (() => json(ollamaModels)) as unknown as typeof fetch,
    );
    expect(r).toEqual({
      kind: "model-missing",
      available: ["gpt-oss:20b-q3_k_m"],
    });
  });

  it("sends the key for authenticated endpoints", async () => {
    const f = vi.fn(() => json(ollamaModels));
    await checkLocalModel(
      "https://example.test/v1",
      "gpt-oss:20b-q3_k_m",
      f as unknown as typeof fetch,
      "secret",
    );
    expect(f.mock.calls[0]).toEqual([
      "https://example.test/v1/models",
      expect.objectContaining({ headers: { Authorization: "Bearer secret" } }),
    ]);
  });

  it("separates HTTP errors, unreadable lists and unreachable servers", async () => {
    expect(
      await checkLocalModel(
        "http://x/v1",
        "m",
        (() => json({}, 500)) as unknown as typeof fetch,
      ),
    ).toEqual({ kind: "http-error", status: 500 });
    expect(
      await checkLocalModel(
        "http://x/v1",
        "m",
        (() =>
          Promise.resolve(new Response("not json"))) as unknown as typeof fetch,
      ),
    ).toEqual({ kind: "reachable" });
    expect(
      await checkLocalModel(
        "http://x/v1",
        "m",
        (() =>
          Promise.reject(new Error("connection refused"))) as unknown as typeof fetch,
      ),
    ).toEqual({ kind: "unreachable", message: "connection refused" });
  });
});
