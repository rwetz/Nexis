import { APICallError, InvalidPromptError, RetryError } from "ai";
import { describe, expect, it } from "vitest";
import { formatChatError } from "./chatError";

const url = "http://localhost:11434/v1/chat/completions";

describe("formatChatError", () => {
  it("shows the HTTP status and the provider's own message", () => {
    const err = new APICallError({
      message: "Not Found",
      url,
      requestBodyValues: {},
      statusCode: 404,
      responseBody: JSON.stringify({
        error: { message: "model 'nope:1b' not found", type: "api_error" },
      }),
    });
    const text = formatChatError(err);
    expect(text).toContain("HTTP 404: model 'nope:1b' not found.");
    expect(text).toContain("model id");
    expect(text).toContain(url);
  });

  it("explains a connection failure with no status", () => {
    const err = new APICallError({
      message: "Cannot connect to API: connection refused",
      url,
      requestBodyValues: {},
    });
    expect(formatChatError(err)).toMatch(
      /^Cannot connect to API: connection refused\. Check the server is running/,
    );
  });

  it("unwraps a RetryError to the last real failure", () => {
    const last = new APICallError({
      message: "Unauthorized",
      url,
      requestBodyValues: {},
      statusCode: 401,
      responseBody: '{"error":"bad key"}',
    });
    const err = new RetryError({
      message: "Failed after 3 attempts",
      reason: "maxRetriesExceeded",
      errors: [last, last, last],
    });
    expect(formatChatError(err)).toContain("HTTP 401: bad key.");
  });

  it("names SDK errors like the v7 prompt rejection instead of hiding them", () => {
    const err = new InvalidPromptError({
      prompt: undefined,
      message: "System messages are not allowed in the prompt or messages fields.",
    });
    const text = formatChatError(err);
    expect(text).toContain("AI_InvalidPromptError");
    expect(text).toContain("System messages are not allowed");
    expect(text).not.toBe("An error occurred.");
  });

  it("redacts secrets echoed back in an error body", () => {
    const err = new Error(
      "rejected key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
    );
    expect(formatChatError(err)).not.toContain(
      "abcdefghijklmnopqrstuvwxyz0123456789",
    );
  });

  it("falls back to a non-empty message for unknown values", () => {
    expect(formatChatError(undefined)).toBeTruthy();
    expect(formatChatError("plain string")).toBe("plain string");
  });
});
