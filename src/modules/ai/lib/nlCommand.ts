// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Natural-language → command ("AI command search").
 *
 * The terminal's AI command bar sends a plain-language intent here; the
 * configured provider returns one runnable command plus a one-line
 * explanation. The result is only ever *inserted at the shell prompt* —
 * never executed — so the user's Enter is the confirmation step.
 *
 * That insert-only contract is what makes `sanitizeCommand` load-bearing:
 * text written to the PTY input line must be a single line with zero
 * control characters, because a stray `\r`/`\n` would execute the command
 * without the user's Enter. Multi-line or control-laden model output is
 * rejected outright rather than stripped — a model that needed a newline
 * meant a different command than the stripped one would be.
 */

import { generateText } from "ai";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { buildConfiguredLanguageModel } from "./agent";
import { getAllKeys } from "./keyring";
import { checkShellCommand } from "./security";

export type NlCommandContext = {
  platform: "macos" | "linux" | "windows" | "";
  /** Shell name for the prompt (e.g. "zsh", "pwsh"); best-effort. */
  shell?: string | null;
  cwd?: string | null;
};

export type NlCommandResult = {
  /** Empty string = the model declined (destructive/ambiguous/impossible);
   * `explanation` then says why. */
  command: string;
  explanation: string;
  /** Set when the destructive-command heuristic flags the suggestion —
   * shown as a caution, not a block, since nothing runs without the
   * user's Enter at the prompt. */
  warning?: string;
};

const MAX_COMMAND_CHARS = 2048;

function sanitizeCommand(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const c = raw.trim();
  if (!c || c.length > MAX_COMMAND_CHARS) return null;
  if (/[\x00-\x1f\x7f]/.test(c)) return null;
  return c;
}

function withWarning(r: {
  command: string;
  explanation: string;
}): NlCommandResult {
  const check = checkShellCommand(r.command);
  return check.ok ? r : { ...r, warning: check.reason };
}

export function buildNlCommandMessages(
  intent: string,
  ctx: NlCommandContext,
): { system: string; prompt: string } {
  const shellName =
    ctx.shell?.trim() ||
    (ctx.platform === "windows" ? "PowerShell" : "a POSIX shell");
  const os = ctx.platform || "an unknown OS";
  const system = [
    "You translate a plain-language request into one runnable shell command.",
    `Target: ${shellName} on ${os}.`,
    'Reply with ONLY a JSON object, no markdown fences: {"command": "...", "explanation": "..."}.',
    "The command must be a single line. The explanation is one short sentence.",
    "Prefer safe, widely available tools; add flags that make output readable.",
    'If the request is destructive, ambiguous, or impossible, return {"command": "", "explanation": "<why>"} instead of guessing.',
  ].join("\n");
  const cwd = ctx.cwd?.trim();
  const prompt = cwd
    ? `Current directory: ${cwd}\n\nRequest: ${intent.trim()}`
    : `Request: ${intent.trim()}`;
  return { system, prompt };
}

function* jsonCandidates(t: string): Generator<string> {
  yield t;
  const fenced = /```(?:json)?\s*\n([\s\S]*?)```/.exec(t);
  if (fenced) yield fenced[1];
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last > first) yield t.slice(first, last + 1);
}

export function parseNlCommandResponse(text: string): NlCommandResult | null {
  const t = text.trim();
  if (!t) return null;

  // Preferred shape: a JSON object — bare, fenced, or embedded in prose.
  for (const candidate of jsonCandidates(t)) {
    let v: unknown;
    try {
      v = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (!v || typeof v !== "object" || !("command" in v)) continue;
    const o = v as { command?: unknown; explanation?: unknown };
    const explanation =
      typeof o.explanation === "string" ? o.explanation.trim() : "";
    if (typeof o.command === "string" && o.command.trim() === "") {
      return { command: "", explanation };
    }
    const command = sanitizeCommand(o.command);
    // The model answered in the right shape but the command is unusable
    // (multi-line, control chars, over-long) — don't fall through to the
    // laxer parsers, they'd just re-derive the same unusable text.
    if (!command) return null;
    return withWarning({ command, explanation });
  }

  // Fallback: fenced code block containing exactly one command line, with
  // the first non-empty prose line outside the fence as the explanation.
  // A multi-line fence is a script, not a command — inserting just its
  // first line would run something other than what the model proposed, so
  // it's rejected rather than truncated.
  const fence = /```[a-zA-Z]*\s*\n([\s\S]*?)```/.exec(t);
  if (fence) {
    const lines = fence[1].split("\n").filter((l) => l.trim().length > 0);
    if (lines.length !== 1) return null;
    const command = sanitizeCommand(lines[0]);
    if (!command) return null;
    const explanation =
      t
        .replace(fence[0], "")
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.length > 0) ?? "";
    return withWarning({ command, explanation });
  }

  // Last resort: a bare single-line reply is taken as the command itself.
  if (!t.includes("\n")) {
    const command = sanitizeCommand(t);
    if (!command) return null;
    return withWarning({ command, explanation: "" });
  }

  return null;
}

export async function generateNlCommand(
  intent: string,
  ctx: NlCommandContext,
  opts: { abortSignal?: AbortSignal } = {},
): Promise<NlCommandResult> {
  const prefs = usePreferencesStore.getState();
  const keys = await getAllKeys();
  const model = await buildConfiguredLanguageModel(prefs.defaultModelId, keys, {
    lmstudioBaseURL: prefs.lmstudioBaseURL,
    lmstudioModelId: prefs.lmstudioModelId,
    mlxBaseURL: prefs.mlxBaseURL,
    mlxModelId: prefs.mlxModelId,
    ollamaBaseURL: prefs.ollamaBaseURL,
    ollamaModelId: prefs.ollamaModelId,
    vllmBaseURL: prefs.vllmBaseURL,
    vllmModelId: prefs.vllmModelId,
    xllmBaseURL: prefs.xllmBaseURL,
    xllmModelId: prefs.xllmModelId,
    sglangBaseURL: prefs.sglangBaseURL,
    sglangModelId: prefs.sglangModelId,
    openaiCompatibleBaseURL: prefs.openaiCompatibleBaseURL,
    openaiCompatibleModelId: prefs.openaiCompatibleModelId,
  });
  const { system, prompt } = buildNlCommandMessages(intent, ctx);
  const { text } = await generateText({
    model,
    system,
    prompt,
    abortSignal: opts.abortSignal,
  });
  const parsed = parseNlCommandResponse(text);
  if (!parsed) {
    throw new Error("The model didn't return a usable single-line command.");
  }
  return parsed;
}
