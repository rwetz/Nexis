// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { APICallError, RetryError } from "ai";
import { redactSensitive } from "./redact";

const MAX_DETAIL = 600;

/** Pull the human message out of an OpenAI-style (or similar) error body. */
function messageFromBody(body: string | undefined): string | null {
  if (!body?.trim()) return null;
  try {
    const parsed = JSON.parse(body) as unknown;
    const pick = (v: unknown): string | null => {
      if (typeof v === "string" && v.trim()) return v.trim();
      if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        return pick(o.message) ?? pick(o.error) ?? pick(o.detail);
      }
      return null;
    };
    return pick(parsed);
  } catch {
    return body.trim();
  }
}

function clip(s: string): string {
  return s.length > MAX_DETAIL ? `${s.slice(0, MAX_DETAIL - 1)}…` : s;
}

/**
 * Turn whatever the agent stream threw into the text the chat error card
 * shows. The AI SDK's default replaces every error with "An error occurred.",
 * which hid real failures (a rejected prompt, a 404 for a missing model, a
 * refused connection) behind one useless line.
 */
export function formatChatError(error: unknown): string {
  if (RetryError.isInstance(error) && error.lastError !== undefined) {
    return formatChatError(error.lastError);
  }
  if (APICallError.isInstance(error)) {
    const parts: string[] = [];
    const status = error.statusCode;
    const raw = messageFromBody(error.responseBody) ?? error.message;
    const detail = /[.!?]$/.test(raw) ? raw : `${raw}.`;
    parts.push(status ? `HTTP ${status}: ${detail}` : detail);
    if (status === 404) {
      parts.push(
        "Check the model id in Settings → Models matches a model the server has loaded.",
      );
    } else if (status === 401 || status === 403) {
      parts.push("Check the API key for this provider in Settings → Models.");
    } else if (!status) {
      parts.push(
        "Check the server is running and the base URL in Settings → Models is right.",
      );
    }
    if (error.url) parts.push(`(${error.url})`);
    return redactSensitive(clip(parts.join(" ")));
  }
  if (error instanceof Error) {
    const name =
      error.name && error.name !== "Error" ? `${error.name}: ` : "";
    return redactSensitive(clip(`${name}${error.message}`));
  }
  if (typeof error === "string" && error.trim()) {
    return redactSensitive(clip(error));
  }
  return "Unknown error from the model provider.";
}
