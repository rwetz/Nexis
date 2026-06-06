// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import type { ModelMessage } from "ai";
import { compactModelMessagesDetailed } from "./compact";

// Helpers for building minimal message arrays

function userMsg(text: string): ModelMessage {
  return { role: "user", content: text };
}

function toolCallMsg(toolCallId: string, toolName: string): ModelMessage {
  return {
    role: "assistant",
    content: [{ type: "tool-call", toolCallId, toolName, input: { command: "ls" } }],
  } as unknown as ModelMessage;
}

function toolResultMsg(toolCallId: string, output: unknown): ModelMessage {
  return {
    role: "tool",
    content: [{ type: "tool-result", toolCallId, output }],
  } as unknown as ModelMessage;
}

describe("compact — pitfall 11: circular tool output", () => {
  it("does not throw when approxBytes encounters a circular tool-result output (pitfall 11)", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    const messages: ModelMessage[] = [
      userMsg("hi"),
      toolCallMsg("x1", "bash_run"),
      toolResultMsg("x1", circular),
    ];

    // contextLimit=1 forces approxBytes to run so safeJsonLength is exercised.
    expect(() => compactModelMessagesDetailed(messages, 1)).not.toThrow();
  });

  it("returns a CompactResult (not undefined) for messages with circular output (pitfall 11)", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    const messages: ModelMessage[] = [
      userMsg("hi"),
      toolCallMsg("x1", "bash_run"),
      toolResultMsg("x1", circular),
    ];

    const result = compactModelMessagesDetailed(messages, 1);
    expect(result).toBeDefined();
    expect(result.messages).toBeInstanceOf(Array);
  });

  it("handles multiple circular outputs in a long conversation without throwing (pitfall 11)", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    // 30 tool calls should push well over the compaction threshold.
    const messages: ModelMessage[] = [userMsg("start")];
    for (let i = 0; i < 30; i++) {
      messages.push(toolCallMsg(`id-${i}`, "bash_run"));
      messages.push(toolResultMsg(`id-${i}`, circular));
    }

    expect(() => compactModelMessagesDetailed(messages, 10)).not.toThrow();
  });

  it("elides tool-result content during compaction but does not lose messages", () => {
    const messages: ModelMessage[] = [
      userMsg("start"),
      ...Array.from({ length: 30 }, (_, i) => [
        toolCallMsg(`t${i}`, "bash_run"),
        toolResultMsg(`t${i}`, "x".repeat(500)),
      ]).flat(),
      userMsg("what did you do?"),
    ];

    const { messages: out, compacted } = compactModelMessagesDetailed(messages, 100);
    expect(out.length).toBe(messages.length);
    expect(compacted).toBe(true);
  });
});
