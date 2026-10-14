import { streamText, type ModelMessage } from "ai";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { buildAgentPrompt } from "./agent";

const history: ModelMessage[] = [
  { role: "user", content: "hi" },
  { role: "assistant", content: "hello" },
  { role: "user", content: "test" },
];

describe("buildAgentPrompt", () => {
  it("keeps system text out of messages (AI SDK v7 rejects it there)", () => {
    const { instructions, messages } = buildAgentPrompt(
      "SYSTEM",
      history,
      "ollama",
      true,
    );
    expect(instructions.map((m) => m.content)).toEqual([
      "SYSTEM",
      expect.stringContaining("PLAN MODE"),
    ]);
    expect(messages.some((m) => m.role === "system")).toBe(false);
    expect(messages).toHaveLength(3);
  });

  it("drops a stray system message that arrives in the history", () => {
    const { messages } = buildAgentPrompt(
      "SYSTEM",
      [{ role: "system", content: "smuggled" }, ...history],
      "openrouter",
    );
    expect(messages.some((m) => m.role === "system")).toBe(false);
  });

  it("marks Anthropic cache breakpoints on the system prefix and the tail only", () => {
    const { instructions, messages } = buildAgentPrompt(
      "SYSTEM",
      history,
      "anthropic",
    );
    const marker = { anthropic: { cacheControl: { type: "ephemeral" } } };
    expect(instructions[0].providerOptions).toEqual(marker);
    expect(messages[messages.length - 1].providerOptions).toEqual(marker);
    expect(messages[0].providerOptions).toBeUndefined();
    expect(history[2].providerOptions).toBeUndefined();
  });

  it("is accepted by streamText and reaches the model with the system prompt first", async () => {
    const model = new MockLanguageModelV4({
      doStream: {
        stream: convertArrayToReadableStream([
          { type: "text-start", id: "t" },
          { type: "text-delta", id: "t", delta: "ok" },
          { type: "text-end", id: "t" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
              inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: 1, text: 1, reasoning: 0 },
            },
          },
        ]),
      },
    });
    const { instructions, messages } = buildAgentPrompt(
      "SYSTEM",
      history,
      "ollama",
    );
    const errors: unknown[] = [];
    const result = streamText({
      model,
      instructions,
      messages,
      onError: ({ error }) => {
        errors.push(error);
      },
    });
    expect(await result.text).toBe("ok");
    expect(errors).toEqual([]);
    const prompt = model.doStreamCalls[0].prompt;
    expect(prompt[0]).toMatchObject({ role: "system", content: "SYSTEM" });
    expect(prompt.slice(1).map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
    ]);
  });
});
