---
type: subsystem
description: AI module — agent loop, providers, tool registry, subagents, compaction, key storage.
---

# AI subsystem (`src/modules/ai/`)

The chat/agent feature. Built on the Vercel AI SDK (`ai` package); everything runs in the frontend, with Rust involved only as an HTTP proxy and tool executor.

## The agent loop

`lib/agent.ts:runAgentStream` is the single entry point for a chat turn. Order matters:

1. `buildConfiguredLanguageModel` — resolves provider + model (cloud keys or local endpoints: LM Studio, Ollama, vLLM, MLX, SGLang, xLLM, OpenAI-compatible)
2. `convertToModelMessages` → `pruneMessages({reasoning: "all", emptyMessages: "remove"})` — **must stay before compaction** (CLAUDE.md pitfall #3; Cerebras rejects reasoning blocks in history)
3. `compactModelMessagesDetailed` (`lib/compact.ts`) — context-limit compaction; byte estimation goes through `safeJsonLength` (pitfall #11 — tool outputs are untrusted, may be circular)
4. system prompt assembly (`buildStableSystem` + optional plan-mode prompt) → `applyCacheBreakpoints` → `streamText` with `buildTools`, capped at `MAX_AGENT_STEPS`

## Tools

`tools/tools.ts:buildTools` composes seven families: fs, edit, search, shell, subagent, terminal, todo — all taking a shared `ToolContext` (`tools/context.ts`, owns `resolvePath`).

- `tools/shell.ts` memoizes session shells in `sessionShells`; the rejection-eviction in its `.catch()` is load-bearing (pitfall #10)
- Rust-side execution goes through `lib/native.ts` — the AI's bridge to `fs_*`, `git_*`, `shell_*`, `lsp_*`, `dap_*` commands (see [[ipc-surface]])

## Subagents

`agents/runSubagent.ts` runs typed subagents from `agents/registry.ts` (read-only fs+search tools, `generateText`, max 12 steps). It passes a **single prompt string, no message history** — which is why it doesn't call `pruneMessages`. If subagents ever gain conversation history, pitfall #3 applies to them too.

## Supporting pieces

- `lib/proxyFetch.ts` — routes provider HTTP through Rust `ai_http_request`/`ai_http_stream` (`net.rs`), avoiding CORS and keeping keys out of browser fetch
- `lib/keyring.ts` — API keys in the OS keychain via `secrets_*`; cross-window change signal is `nexis://ai-keys-changed`
- `lib/security.ts` — hardened path checks; keeps a **deliberate private basename** (do not consolidate into `lib/path.ts` — pitfall #12 exception)
- `lib/compact.ts`, `lib/redact.ts`, `lib/sessions.ts`, `lib/slashCommands.ts`, `lib/todos.ts` — compaction, secret redaction, session persistence, slash commands, todo state
- `store/` — five Zustand stores ([[zustand-stores]]); `chatStore.ts` is the big one
- `components/AiInputBar.tsx` — composer; **never re-add `disabled={c.isBusy}`** (pitfall #5)

## Related

[[ipc-surface]] · [[settings-sync]] (model/provider prefs live there) · CLAUDE.md pitfalls #3, #5, #10, #11
