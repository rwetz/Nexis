// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Icon, type IconName } from "@/components/icon";
import type { ProviderId } from "@/modules/ai/config";
import { PROVIDER_MARKS } from "./providerMarks";

/**
 * Fallback glyph for providers with no brand mark in {@link PROVIDER_MARKS}.
 *
 * Three of these are real logos that Phosphor happens to ship (OpenAI, X for
 * xAI, Apple for MLX). The rest are deliberate generics chosen to say something
 * true about the provider — Cerebras builds silicon, Groq sells inference
 * speed, `openai-compatible` is by definition a socket — rather than pretending
 * to be a logo we don't have.
 *
 * The map stays exhaustive over `ProviderId` even for providers that *do* have
 * a mark, so adding a provider fails the build until it is handled here.
 */
const FALLBACK_GLYPH = {
  openai: "brand-openai",
  xai: "brand-xai",
  mlx: "brand-apple",
  cerebras: "cpu",
  groq: "flash",
  zai: "sparkle",
  "openai-compatible": "plugin",
  xllm: "server-alt",
  sglang: "layers",
  anthropic: "sparkle",
  google: "sparkle",
  deepseek: "brain",
  mistral: "flash",
  openrouter: "globe",
  lmstudio: "computer",
  ollama: "server",
  vllm: "rocket",
  huggingface: "brain",
} as const satisfies Record<ProviderId, IconName>;

type Props = {
  provider: ProviderId;
  size?: number;
  className?: string;
};

export function ProviderIcon({ provider, size = 14, className }: Props) {
  const mark = PROVIDER_MARKS[provider];
  if (mark) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="currentColor"
        aria-hidden
        focusable="false"
        className={className}
      >
        <path d={mark} />
      </svg>
    );
  }
  return (
    <Icon name={FALLBACK_GLYPH[provider]} size={size} className={className} />
  );
}
