import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL_ID, getModel, type ModelId } from "../config";
import { EMPTY_PROVIDER_KEYS, type ProviderKeys } from "./keyring";
import { usableModelId } from "./modelFallback";

const keys = (partial: Partial<ProviderKeys>): ProviderKeys => ({
  ...EMPTY_PROVIDER_KEYS,
  ...partial,
});

describe("usableModelId", () => {
  it("keeps the preference when its provider has a key", () => {
    expect(usableModelId("gpt-5.4-mini", keys({ openai: "sk-test" }))).toBe("gpt-5.4-mini");
  });

  it("switches to the same model through OpenRouter when only OpenRouter is connected", () => {
    const id = usableModelId(DEFAULT_MODEL_ID, keys({ openrouter: "sk-or-test" }));
    expect(getModel(id).provider).toBe("openrouter");
    expect(getModel(id).label).toBe(getModel(DEFAULT_MODEL_ID).label);
  });

  it("falls back to any connected provider when no twin exists", () => {
    const id = usableModelId(DEFAULT_MODEL_ID, keys({ groq: "gsk-test" }));
    expect(getModel(id).provider).toBe("groq");
  });

  it("falls back to a configured local runtime when no key is present", () => {
    const id = usableModelId(DEFAULT_MODEL_ID, EMPTY_PROVIDER_KEYS, ["ollama"]);
    expect(getModel(id).provider).toBe("ollama");
  });

  it("keeps the preference when nothing is connected, so the error names the missing key", () => {
    expect(usableModelId(DEFAULT_MODEL_ID, EMPTY_PROVIDER_KEYS)).toBe(DEFAULT_MODEL_ID);
  });

  it("never second-guesses a keyless (local) preference", () => {
    const local = "ollama-local" as ModelId;
    expect(usableModelId(local, keys({ openrouter: "sk-or-test" }))).toBe(local);
  });
});
