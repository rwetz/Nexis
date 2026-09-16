// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { createSecretStore } from "@/platform/secrets";
import {
  getProvider,
  KEYRING_SERVICE,
  PROVIDERS,
  providerSupportsKey,
  type ProviderId,
} from "../config";

export type ProviderKeys = Record<ProviderId, string | null>;

export const EMPTY_PROVIDER_KEYS: ProviderKeys = {
  openai: null,
  anthropic: null,
  google: null,
  xai: null,
  cerebras: null,
  groq: null,
  deepseek: null,
  mistral: null,
  openrouter: null,
  zai: null,
  "openai-compatible": null,
  lmstudio: null,
  mlx: null,
  ollama: null,
  vllm: null,
  xllm: null,
  sglang: null,
  huggingface: null,
};

const providerSecrets = createSecretStore(KEYRING_SERVICE);

export async function getKey(provider: ProviderId): Promise<string | null> {
  if (!providerSupportsKey(provider)) return null;
  try {
    const v = await providerSecrets.get(getProvider(provider).keyringAccount);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export async function setKey(provider: ProviderId, key: string): Promise<void> {
  if (!providerSupportsKey(provider)) {
    throw new Error(`${provider} does not use an API key`);
  }
  const trimmed = key.trim();
  if (!trimmed) throw new Error("API key is empty");
  await providerSecrets.set(getProvider(provider).keyringAccount, trimmed);
}

export async function clearKey(provider: ProviderId): Promise<void> {
  if (!providerSupportsKey(provider)) return;
  try {
    await providerSecrets.delete(getProvider(provider).keyringAccount);
  } catch {
    // already absent — fine
  }
}

export async function getAllKeys(): Promise<ProviderKeys> {
  const out = { ...EMPTY_PROVIDER_KEYS };
  const need = PROVIDERS.filter((p) => providerSupportsKey(p.id));
  try {
    const results = await providerSecrets.getAll(
      need.map((p) => p.keyringAccount),
    );
    need.forEach((p, i) => {
      const v = results[i];
      out[p.id] = v && v.length > 0 ? v : null;
    });
    return out;
  } catch {
    const entries = await Promise.all(
      need.map(async (p) => [p.id, await getKey(p.id)] as const),
    );
    for (const [id, v] of entries) out[id] = v;
    return out;
  }
}

export function hasAnyKey(keys: ProviderKeys): boolean {
  return PROVIDERS.some((p) => providerSupportsKey(p.id) && !!keys[p.id]);
}
