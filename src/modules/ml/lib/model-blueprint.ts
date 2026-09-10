import type { MlTemplate } from "./engine-bridge";

export type ModelScale = "starter" | "balanced" | "ambitious";
export type CreationOverride = { section: string; key: string; value: string };

/** Sensible local-model sizes. Text values are deliberately tiny GPT-style
 * character models, not misleading claims of foundation-model scale. */
export function creationOverrides(
  template: MlTemplate,
  scale: ModelScale,
): CreationOverride[] {
  const train = {
    starter: ["20", "32", "0.001"],
    balanced: ["80", "64", "0.0005"],
    ambitious: ["200", "64", "0.0003"],
  }[scale];
  const out: CreationOverride[] = [
    { section: "train", key: "epochs", value: train[0] },
    { section: "train", key: "batch_size", value: train[1] },
    { section: "train", key: "lr", value: train[2] },
  ];
  if (template !== "textgen") return out;
  const gpt = {
    starter: ["64", "64", "4", "2"],
    balanced: ["128", "128", "4", "4"],
    ambitious: ["256", "256", "8", "6"],
  }[scale];
  return [
    ...out,
    { section: "model", key: "context", value: gpt[0] },
    { section: "model", key: "embed", value: gpt[1] },
    { section: "model", key: "heads", value: gpt[2] },
    { section: "model", key: "layers", value: gpt[3] },
  ];
}
