// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import {
  MODELS,
  getModel,
  providerNeedsKey,
  type ModelId,
  type ModelInfo,
  type ProviderId,
} from "../config";
import type { ProviderKeys } from "./keyring";

/**
 * The model the composer should actually use, given what is connected.
 *
 * The default (`DEFAULT_MODEL_ID`, or the one picked in Settings) names one
 * provider. When that provider needs a key the user has not added, the first
 * message used to fail with "No API key configured for openai" even with a
 * working OpenRouter key in the keychain. Instead this picks, in order: the
 * same model through a connected provider (OpenRouter carries most cloud
 * models under the same label), any model of a connected keyed provider, then
 * a configured local runtime. With nothing connected the preference stands,
 * so the error still says which key to add.
 *
 * The saved preference is never rewritten; only the live selection follows.
 */
export function usableModelId(
  preferred: ModelId,
  keys: ProviderKeys,
  configuredLocal: readonly ProviderId[] = [],
): ModelId {
  const wanted = getModel(preferred);
  if (!providerNeedsKey(wanted.provider)) return preferred;
  if (keys[wanted.provider]) return preferred;

  const keyed = (m: ModelInfo) => providerNeedsKey(m.provider) && !!keys[m.provider];
  const candidates: readonly ModelInfo[] = MODELS;
  const twin = candidates.find((m) => keyed(m) && m.label === wanted.label);
  if (twin) return twin.id as ModelId;
  const anyKeyed = candidates.find(keyed);
  if (anyKeyed) return anyKeyed.id as ModelId;
  const local = candidates.find((m) => configuredLocal.includes(m.provider));
  return (local?.id as ModelId | undefined) ?? preferred;
}
