import type { MlTemplate } from "./engine-bridge";
import { tomlGet, tomlSet, tomlUpsert } from "./toml-edit";

export type ModelScale = "starter" | "balanced" | "ambitious";
/** One `train.toml` edit. `upsert` adds the key when the scaffold lacks it;
 *  reserve it for keys both engines document, like `[data] path`. */
export type CreationOverride = {
  section: string;
  key: string;
  value: string;
  upsert?: boolean;
};

/** Sensible local-model sizes. Text values are deliberately tiny GPT-style
 * character models, not misleading claims of foundation-model scale. */
export function creationOverrides(
  template: MlTemplate,
  scale: ModelScale,
  { budgetOnly = false }: { budgetOnly?: boolean } = {},
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
  if (template !== "textgen" || budgetOnly) return out;
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

/**
 * Apply edits to a scaffolded train.toml. A non-upsert key the scaffold does
 * not have is left out and reported, so the panel can say "kept the engine's
 * default" instead of claiming an architecture it did not write.
 */
export function applyOverrides(
  text: string,
  overrides: readonly CreationOverride[],
): { text: string; skipped: CreationOverride[] } {
  const skipped: CreationOverride[] = [];
  let next = text;
  for (const o of overrides) {
    if (o.upsert) {
      next = tomlUpsert(next, o.section, o.key, o.value);
    } else if (tomlGet(next, o.section, o.key) === null) {
      skipped.push(o);
    } else {
      next = tomlSet(next, o.section, o.key, o.value);
    }
  }
  return { text: next, skipped };
}
