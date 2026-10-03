// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Stock networks: named, ready-made starting points for a new ML project.
 *
 * The engine owns its templates (`tabular` MLP, `image` CNN, `textgen` GPT)
 * and their `train.toml` schema, so a stock network is not a new template.
 * Each one is a choice of documented keys on top of an engine template: an
 * architecture (`[model]`), sometimes a training budget (`[train]`), and for
 * the starters a generated dataset plus where `[data]` should point. That
 * keeps every stock network trainable on either engine that supports its
 * family, with nothing the engine has to learn about.
 *
 * Two groups:
 *  - **architectures**: the classic network shapes, to compare and learn on.
 *  - **starters**: a familiar job with its own synthetic dataset, so the
 *    project trains the moment it exists.
 */
import type { MlTemplate } from "./engine-bridge";
import { creationOverrides, type CreationOverride, type ModelScale } from "./model-blueprint";
import { STARTER_DATASETS, type StarterDatasetId } from "./starter-data";

export type StockFamily = Exclude<MlTemplate, "blank">;
export type StockGroup = "starter" | "architecture";

export type StockModel = {
  id: string;
  label: string;
  family: StockFamily;
  group: StockGroup;
  /** One line: what it's for. */
  blurb: string;
  /** The shape at a glance, e.g. "MLP · 64 → 32". */
  shape: string;
  /** Suggested project directory name. */
  name: string;
  /** Saved to PROJECT.md as the training brief. */
  purpose: string;
  /** `[model]` and `[train]` values. Applied after the scale's budget. */
  config: CreationOverride[];
  dataset?: StarterDatasetId;
};

const model = (key: string, value: string): CreationOverride => ({ section: "model", key, value });
const train = (key: string, value: string): CreationOverride => ({ section: "train", key, value });
const hidden = (...widths: number[]) => model("hidden", `[${widths.join(", ")}]`);
const mlpShape = (widths: number[]) =>
  widths.length === 0 ? "Linear · no hidden layer" : `MLP · ${widths.join(" → ")}`;

function mlp(
  id: string,
  label: string,
  widths: number[],
  blurb: string,
  extra: CreationOverride[] = [],
): StockModel {
  return {
    id,
    label,
    family: "tabular",
    group: "architecture",
    blurb,
    shape: mlpShape(widths),
    name: id,
    purpose: `${label}: ${blurb}`,
    config: [hidden(...widths), ...extra],
  };
}

function cnn(id: string, label: string, conv1: number, conv2: number, dense: number, blurb: string): StockModel {
  return {
    id,
    label,
    family: "image",
    group: "architecture",
    blurb,
    shape: `CNN · ${conv1}/${conv2} filters → ${dense}`,
    name: id,
    purpose: `${label}: ${blurb}`,
    config: [model("conv1", String(conv1)), model("conv2", String(conv2)), model("hidden", String(dense))],
  };
}

function gpt(
  id: string,
  label: string,
  [context, embed, heads, layers]: [number, number, number, number],
  blurb: string,
): StockModel {
  return {
    id,
    label,
    family: "textgen",
    group: "architecture",
    blurb,
    shape: `GPT · ${layers}×${heads}h · width ${embed} · ctx ${context}`,
    name: id,
    purpose: `${label}: ${blurb}`,
    config: [
      model("context", String(context)),
      model("embed", String(embed)),
      model("heads", String(heads)),
      model("layers", String(layers)),
    ],
  };
}

function starter(
  id: string,
  label: string,
  dataset: StarterDatasetId,
  widths: number[],
  blurb: string,
  purpose: string,
): StockModel {
  return {
    id,
    label,
    family: "tabular",
    group: "starter",
    blurb,
    shape: mlpShape(widths),
    name: id,
    purpose,
    config: [hidden(...widths)],
    dataset,
  };
}

export const STOCK_MODELS: StockModel[] = [
  // ── Starters: a job, a network, and data to train on now ──
  starter(
    "goat-ranker", "Basketball GOAT", "basketball", [64, 32],
    "Rank players by career stats (the walkthrough).",
    "Learn which career stat lines make an all-time great, then rank every player by the model's confidence that they are one. See docs/ML_MODEL_WALKTHROUGH.md.",
  ),
  starter(
    "game-picker", "Game picker", "games", [32, 16],
    "Call home or away wins from team form.",
    "Predict whether the home team wins from net ratings, rest days and injuries.",
  ),
  starter(
    "churn-risk", "Churn risk", "churn", [32, 16],
    "Flag customers likely to leave.",
    "Predict which customers are likely to leave from usage and billing signals.",
  ),
  starter(
    "lead-score", "Lead score", "leads", [32, 16],
    "Rank leads by chance to convert.",
    "Rank incoming leads by how likely they are to convert, using engagement signals.",
  ),
  starter(
    "credit-risk", "Credit risk", "credit", [64, 32],
    "Estimate default risk from a credit profile.",
    "Estimate the chance an applicant defaults. A teaching model on synthetic data, not a lending decision tool.",
  ),
  starter(
    "fraud-flag", "Fraud flag", "fraud", [64, 32, 16],
    "Spot rare fraudulent transactions.",
    "Flag suspicious transactions. Fraud is rare here (about 6%), so watch precision on the confusion matrix, not accuracy alone.",
  ),
  starter(
    "flower-species", "Flower species", "flowers", [16],
    "The classic three-species measurement problem.",
    "Classify a flower's species from four petal and sepal measurements.",
  ),
  starter(
    "wine-quality", "Wine quality", "wine", [32, 16],
    "Grade wines from their chemistry.",
    "Grade wine quality (poor / fine / excellent) from lab chemistry.",
  ),
  starter(
    "home-price-band", "Home price band", "housing", [64, 32],
    "Place a home in a price band.",
    "Place a home in a budget, mid-market or premium price band from its features.",
  ),
  starter(
    "demand-forecast", "Demand band", "demand", [32, 16],
    "Expect a low, normal or high day.",
    "Predict whether a day's demand will be low, normal or high from calendar, weather and price.",
  ),
  starter(
    "exam-pass", "Exam outcome", "students", [16, 8],
    "Predict a pass from study habits.",
    "Predict whether a student passes from study hours, attendance and prior grades.",
  ),
  starter(
    "machine-health", "Machine health", "machines", [32, 16],
    "Warn before equipment fails.",
    "Predict an imminent equipment failure from sensor readings. Failures are rare here (about 12%), so judge it on the confusion matrix's failure row, not accuracy alone.",
  ),

  // ── Tabular architectures ──
  mlp("linear-baseline", "Linear baseline", [], "Logistic regression. Every other net has to beat this.", [train("lr", "0.01")]),
  mlp("tiny-mlp", "Tiny MLP", [8], "One small hidden layer. Fast, and hard to overfit."),
  mlp("classic-mlp", "Classic MLP", [32, 16], "The dependable two-layer default."),
  mlp("wide-mlp", "Wide MLP", [256], "One very wide layer. Memorizes well, so watch validation."),
  mlp("deep-funnel", "Deep funnel", [128, 64, 32], "Narrows step by step toward the answer."),
  mlp("deep-uniform", "Deep uniform", [64, 64, 64, 64], "Four equal layers. Shows what depth alone buys."),
  mlp("bottleneck", "Bottleneck", [64, 8, 64], "Squeezes through 8 units, forcing a compact summary."),
  mlp("big-mlp", "Big MLP", [512, 256, 128], "Large capacity for big CSVs. Use the GPU.", [train("lr", "0.0005")]),

  // ── Image architectures ──
  cnn("mini-cnn", "Mini CNN", 8, 16, 32, "Smallest useful CNN. Trains in seconds on CPU."),
  cnn("lenet-cnn", "LeNet-style", 6, 16, 84, "The 1998 digit reader's proportions."),
  cnn("standard-cnn", "Standard CNN", 16, 32, 64, "The image template's balanced default."),
  cnn("wide-cnn", "Wide CNN", 32, 64, 128, "More filters for subtler textures."),
  cnn("large-cnn", "Large CNN", 64, 128, 256, "Big capacity for many classes. Use the GPU."),

  // ── Text architectures ──
  gpt("nano-gpt", "Nano GPT", [32, 32, 2, 1], "One block. Watch attention learn letters."),
  gpt("micro-gpt", "Micro GPT", [64, 64, 4, 2], "Learns words from a small corpus quickly."),
  gpt("mini-gpt", "Mini GPT", [128, 128, 4, 4], "Picks up phrasing and line structure."),
  gpt("small-gpt", "Small GPT", [256, 256, 8, 6], "Largest stock GPT. Wants a GPU and a few MB of text."),
  gpt("long-context-gpt", "Long-context GPT", [512, 128, 4, 4], "Sees 512 characters back. Good for code and verse."),
  gpt("deep-narrow-gpt", "Deep narrow GPT", [128, 96, 4, 8], "Eight thin blocks. Compare it with Mini GPT."),
];

export function stockModel(id: string): StockModel | undefined {
  return STOCK_MODELS.find((m) => m.id === id);
}

/** The `[data]` keys a starter dataset needs. Upserted, since a scaffold may
 *  have no `[data]` section (the standalone engine falls back to synthetic
 *  blobs without one). */
export function datasetOverrides(stock: StockModel): CreationOverride[] {
  if (!stock.dataset) return [];
  const ds = STARTER_DATASETS[stock.dataset];
  return [
    { section: "data", key: "path", value: `"${ds.path}"`, upsert: true },
    { section: "data", key: "target", value: `"${ds.target}"`, upsert: true },
  ];
}

/** PROJECT.md body for a stock network: the brief plus what the classes mean. */
export function stockBrief(stock: StockModel, purpose: string): string {
  const lines = [purpose.trim() || stock.purpose, "", `Stock network: **${stock.label}** (${stock.shape}).`];
  if (stock.dataset) {
    const ds = STARTER_DATASETS[stock.dataset];
    lines.push(
      "",
      `Starter data: \`${ds.path}\` (synthetic, generated by Nexis). Target column: \`${ds.target}\`.`,
      "",
      "| class | meaning |",
      "|---|---|",
      ...ds.classes.map((c, i) => `| ${i} | ${c} |`),
    );
  }
  return lines.join("\n");
}

/**
 * Lives here, not in model-blueprint.ts: the store imports that module, and
 * this one would drag the catalog and the dataset generators into the main
 * chunk with it.
 *
 * Every edit a new project gets: the scale's training budget, then a stock
 * network's architecture and data (which win on a clash, since the stock
 * network names its size). Later entries replace earlier ones for the same key.
 */
export function planCreation(
  template: MlTemplate,
  scale: ModelScale,
  stock?: StockModel | null,
): CreationOverride[] {
  const all = stock
    ? [
        ...creationOverrides(template, scale, { budgetOnly: true }),
        ...stock.config,
        ...datasetOverrides(stock),
      ]
    : creationOverrides(template, scale);
  const byKey = new Map<string, CreationOverride>();
  for (const o of all) {
    const id = `${o.section}.${o.key}`;
    byKey.delete(id); // keep the winner in its later position
    byKey.set(id, o);
  }
  return [...byKey.values()];
}
