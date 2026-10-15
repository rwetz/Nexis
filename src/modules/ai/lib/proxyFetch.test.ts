import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HttpStreamEvent, HttpStreamRequest } from "@/platform/http-stream";

const sent: HttpStreamRequest[] = [];

vi.mock("@/platform/http-stream", () => ({
  startHttpStream: (
    request: HttpStreamRequest,
    receive: (event: HttpStreamEvent) => void,
  ) => {
    sent.push(request);
    receive({ kind: "headers", status: 200, headers: { "content-type": "text/plain" } });
    receive({ kind: "chunk", bytes: Array.from(new TextEncoder().encode("ok")) });
    receive({ kind: "end" });
    return Promise.resolve();
  },
}));

const { cloudProxyFetch, createProxyFetch } = await import("./proxyFetch");

beforeEach(() => {
  sent.length = 0;
});

const header = (req: HttpStreamRequest, name: string) =>
  Object.entries(req.headers ?? {}).find(([k]) => k.toLowerCase() === name)?.[1];

describe("proxy fetch", () => {
  it("cloud requests refuse private networks; local ones opt in", async () => {
    await cloudProxyFetch("https://openrouter.ai/api/v1/models");
    await createProxyFetch({ allowPrivateNetwork: true })("http://localhost:11434/v1/models");
    expect(sent.map((r) => r.allowPrivateNetwork)).toEqual([false, true]);
  });

  it("streams the response back as a normal Response", async () => {
    const res = await cloudProxyFetch("https://api.openai.com/v1/models");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("sends FormData as raw multipart bytes with its boundary", async () => {
    const audio = new Uint8Array([0, 255, 128, 10, 13, 0xc3]);
    const form = new FormData();
    form.append("model", "whisper-1");
    form.append("file", new Blob([audio], { type: "audio/webm" }), "audio.webm");

    await cloudProxyFetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      body: form,
      headers: { authorization: "Bearer test" },
    });

    const req = sent[0];
    const type = header(req, "content-type") ?? "";
    expect(type).toMatch(/^multipart\/form-data; boundary=/);
    expect(header(req, "authorization")).toBe("Bearer test");
    // The binary part survives byte for byte (a text round-trip would mangle 0xff).
    const bytes = Uint8Array.from(req.body ?? []);
    const at = bytes.findIndex((_, i) => audio.every((b, j) => bytes[i + j] === b));
    expect(at).toBeGreaterThan(-1);
  });

  it("keeps an explicit content type over the body's own", async () => {
    await cloudProxyFetch("https://example.com", {
      method: "POST",
      body: new Blob(["{}"], { type: "text/plain" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(header(sent[0], "content-type")).toBe("application/json");
  });
});
