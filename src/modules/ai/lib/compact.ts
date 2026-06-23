// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import type { ModelMessage } from "ai";

const KEEP_TAIL = 24;
const ELISION_TEXT = "[elided to save context — see prior tool call in history]";

type ToolPart = {
  type: string;
  toolName?: string;
  toolCallId?: string;
  input?: unknown;
  output?: unknown;
  [k: string]: unknown;
};

function safeJsonLength(v: unknown): number {
  try {
    return JSON.stringify(v ?? "").length;
  } catch {
    return 256;
  }
}

/** Cost in approximate bytes for a single message part. */
function partBytes(part: ToolPart): number {
  if (part.type === "text" && typeof part.text === "string")
    return (part.text as string).length;
  if (part.type === "tool-result") return safeJsonLength(part.output);
  if (part.type === "tool-call") return safeJsonLength(part.input);
  return 64;
}

/** Approximate byte count for the full message array. */
function approxBytes(messages: ModelMessage[]): number {
  let n = 0;
  for (const m of messages) {
    if (typeof m.content === "string") {
      n += m.content.length;
    } else if (Array.isArray(m.content)) {
      for (const part of m.content as ToolPart[]) n += partBytes(part);
    }
  }
  return n;
}

/** Compute initial byte totals per message index for incremental tracking. */
function messageBytes(m: ModelMessage): number {
  if (typeof m.content === "string") return m.content.length;
  if (Array.isArray(m.content)) {
    let n = 0;
    for (const part of m.content as ToolPart[]) n += partBytes(part);
    return n;
  }
  return 0;
}

function elideToolResult(part: ToolPart): { changed: boolean; part: ToolPart } {
  if (part.type !== "tool-result") return { changed: false, part };
  if (
    part.output &&
    typeof part.output === "object" &&
    (part.output as { __elided?: boolean }).__elided
  ) {
    return { changed: false, part };
  }
  return {
    changed: true,
    part: {
      ...part,
      output: { type: "text", value: ELISION_TEXT, __elided: true },
    },
  };
}

function pathOfInput(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const p = (input as { path?: unknown }).path;
  return typeof p === "string" && p.length > 0 ? p : null;
}

function collectMutationPaths(messages: ModelMessage[]): Set<string> {
  const paths = new Set<string>();
  for (const m of messages) {
    if (!Array.isArray(m.content)) continue;
    for (const part of m.content as ToolPart[]) {
      if (part.type !== "tool-call") continue;
      const name = part.toolName;
      if (
        name === "edit" ||
        name === "multi_edit" ||
        name === "write_file" ||
        name === "create_directory"
      ) {
        const p = pathOfInput(part.input);
        if (p) paths.add(p);
      }
    }
  }
  return paths;
}

function collectLastReadIdxPerPath(
  messages: ModelMessage[],
): Map<string, number> {
  const lastIdx = new Map<string, number>();
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!Array.isArray(m.content)) continue;
    for (const part of m.content as ToolPart[]) {
      if (part.type !== "tool-call") continue;
      if (part.toolName !== "read_file") continue;
      const p = pathOfInput(part.input);
      if (p) lastIdx.set(p, i);
    }
  }
  return lastIdx;
}

function dropSupersededReads(messages: ModelMessage[]): {
  out: ModelMessage[];
  touched: boolean;
} {
  const mutated = collectMutationPaths(messages);
  const lastReadIdx = collectLastReadIdxPerPath(messages);

  const callIdxToPath = new Map<string, string>();
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!Array.isArray(m.content)) continue;
    for (const part of m.content as ToolPart[]) {
      if (part.type !== "tool-call" || part.toolName !== "read_file") continue;
      const p = pathOfInput(part.input);
      const id = part.toolCallId;
      if (p && typeof id === "string") callIdxToPath.set(id, p);
    }
  }

  let touched = false;
  const out = messages.map((m, i): ModelMessage => {
    if (!Array.isArray(m.content)) return m;
    let local = false;
    const nextContent = (m.content as ToolPart[]).map((part) => {
      if (part.type !== "tool-result") return part;
      const id = part.toolCallId;
      if (typeof id !== "string") return part;
      const path = callIdxToPath.get(id);
      if (!path) return part;
      const isStale =
        mutated.has(path) ||
        (lastReadIdx.has(path) && (lastReadIdx.get(path) as number) > i);
      if (!isStale) return part;
      const r = elideToolResult(part);
      if (r.changed) local = true;
      return r.part;
    });
    if (!local) return m;
    touched = true;
    return { ...m, content: nextContent } as ModelMessage;
  });
  return { out, touched };
}

export type CompactResult = {
  messages: ModelMessage[];
  compacted: boolean;
  droppedCount: number;
};

export function compactModelMessages(
  messages: ModelMessage[],
  contextLimit: number,
): ModelMessage[] {
  return compactModelMessagesDetailed(messages, contextLimit).messages;
}

export function compactModelMessagesDetailed(
  messages: ModelMessage[],
  contextLimit: number,
): CompactResult {
  let dropped = 0;
  let working = messages;
  let approxTokens = approxBytes(working) / 4;

  if (approxTokens >= 0.55 * contextLimit) {
    const r = dropSupersededReads(working);
    if (r.touched) {
      working = r.out;
      dropped++;
      approxTokens = approxBytes(working) / 4;
    }
  }

  if (approxTokens < 0.7 * contextLimit) {
    return {
      messages: working,
      compacted: dropped > 0,
      droppedCount: dropped,
    };
  }

  const out = working.slice();
  const stopIdx = Math.max(0, out.length - KEEP_TAIL);

  // Track total bytes incrementally to avoid O(n²) re-scans: for each
  // elided message we subtract the old size and add the new (tiny) size.
  let runningBytes = approxBytes(out);

  for (let i = 0; i < stopIdx; i++) {
    if (out[i].role === "system") continue;
    if (!Array.isArray(out[i].content)) continue;
    let local = false;
    const oldBytes = messageBytes(out[i]);
    const next = (out[i].content as ToolPart[]).map((part) => {
      const r = elideToolResult(part);
      if (r.changed) local = true;
      return r.part;
    });
    if (local) {
      out[i] = { ...out[i], content: next } as ModelMessage;
      dropped++;
      // Incremental update: subtract old message bytes, add new.
      runningBytes = runningBytes - oldBytes + messageBytes(out[i]);
      if (runningBytes / 4 < 0.6 * contextLimit) break;
    }
  }

  // Hard-ceiling backstop (IDEAS A5): the loop above protects the last
  // KEEP_TAIL messages, so a single very large *recent* tool result could
  // still push the array past the model's context window. As a last resort,
  // elide tool results in the tail too (oldest-first) until the total fits.
  // Elision only swaps a tool-result's output for a stub — it never removes a
  // message — so tool-call/tool-result pairing stays intact and the array
  // length is preserved.
  if (runningBytes / 4 > contextLimit) {
    for (let i = stopIdx; i < out.length; i++) {
      if (out[i].role === "system") continue;
      if (!Array.isArray(out[i].content)) continue;
      let local = false;
      const oldBytes = messageBytes(out[i]);
      const next = (out[i].content as ToolPart[]).map((part) => {
        const r = elideToolResult(part);
        if (r.changed) local = true;
        return r.part;
      });
      if (local) {
        out[i] = { ...out[i], content: next } as ModelMessage;
        dropped++;
        runningBytes = runningBytes - oldBytes + messageBytes(out[i]);
        if (runningBytes / 4 <= contextLimit) break;
      }
    }
  }

  return {
    messages: out,
    compacted: dropped > 0,
    droppedCount: dropped,
  };
}
