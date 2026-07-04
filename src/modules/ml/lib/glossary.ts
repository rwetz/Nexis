// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Hover-to-explain glossary for the ML Lab. Every hyperparameter knob and
 * every concept surfaced in the panel gets a short card: what it is, and
 * what turning it up/down actually does. Written for someone training
 * their second model, not their hundredth.
 *
 * glossary.test.ts enforces that every HP_FIELDS key has an entry, so a
 * new knob can't ship without an explanation.
 */

export type GlossaryEntry = {
  title: string;
  body: string;
};

export const GLOSSARY: Record<string, GlossaryEntry> = {
  // ── train.toml knobs ────────────────────────────────────────────────────
  epochs: {
    title: "Epochs (passes)",
    body: "How many times training works through the whole dataset. More passes give the model more chances to learn, but past a point it starts memorizing the training data instead of learning patterns (watch validation loss rise while training loss keeps falling).",
  },
  steps_per_epoch: {
    title: "Steps per pass",
    body: "How many batches make up one pass. Usually derived from dataset size ÷ batch size; setting it explicitly caps how much of the data each pass sees — useful to shorten passes on big datasets.",
  },
  batch_size: {
    title: "Batch size",
    body: "How many examples the model looks at before each weight update. Bigger batches are steadier and use the GPU better but need more memory and can generalize slightly worse; smaller batches are noisier but sometimes find better solutions.",
  },
  lr: {
    title: "Learning rate",
    body: "How big each weight update is. Too high and the loss jumps around or explodes; too low and training crawls. If loss plateaus early, try lowering it; typical values are 0.01–0.0001.",
  },
  val_split: {
    title: "Validation split",
    body: "The fraction of data held back from training and used only to measure how the model does on examples it has never seen. 0.2 means 20% is reserved. Validation metrics are the honest score — training metrics always look better.",
  },
  seed: {
    title: "Seed",
    body: "The starting point for all the random choices in training (weight init, data shuffling). The same seed on the same data gives a reproducible run — change it to check whether a result was luck.",
  },
  device: {
    title: "Device",
    body: "Where the math runs. \"auto\" picks the GPU when one is usable and falls back to CPU. Small models on small data are often fine on CPU; images and text generation benefit most from a GPU.",
  },
  hidden: {
    title: "Hidden layers",
    body: "The sizes of the network's middle layers, e.g. \"64, 32\" for two layers. More/wider layers can capture more complex patterns but train slower and overfit small datasets faster. For tabular data, start small.",
  },
  context: {
    title: "Context window",
    body: "How many characters the text model can look back on when predicting the next one. Longer context lets it keep track of more structure, but costs memory and compute quadratically.",
  },
  embed: {
    title: "Model width (embedding size)",
    body: "The size of the internal vector each token/character is represented by. Wider models have more capacity but need more data and time to train well.",
  },
  heads: {
    title: "Attention heads",
    body: "How many separate attention patterns each transformer layer learns in parallel. Must divide the model width evenly. More heads let the model track more relationships at once.",
  },
  layers: {
    title: "Layers",
    body: "How many transformer blocks are stacked. Deeper models can learn more abstract patterns; on tiny datasets, extra depth mostly buys slower training and overfitting.",
  },
  conv: {
    title: "Convolution layer",
    body: "Slides small learned filters across the image to detect local patterns — edges and textures in early layers, shapes in later ones. The channel count is how many different patterns the layer can learn.",
  },
  temperature: {
    title: "Temperature",
    body: "How adventurous sampling is when generating. Low (~0.3) keeps to the most likely next characters — safe and repetitive. High (~1.2) takes risks — creative but error-prone. 0.8 is a good default.",
  },
  length: {
    title: "Sample length",
    body: "How many characters each generated preview contains. Longer samples show more of what the model has learned but take longer to produce each pass.",
  },

  // ── concepts ────────────────────────────────────────────────────────────
  run: {
    title: "Run",
    body: "One complete training session. Each run stores its config, metric history, checkpoints, and artifacts under .nexis-ml/runs/ in the project folder, so past runs can be reviewed and compared without retraining.",
  },
  checkpoint: {
    title: "Checkpoint",
    body: "A saved snapshot of the model's weights. Runs keep the best-scoring one and the most recent one; the playground and inference load from these files.",
  },
  onnx: {
    title: "ONNX export",
    body: "ONNX is a portable model format that runs anywhere onnxruntime does (Python, C++, Rust, the browser) — no training framework needed. The export retrains the tabular model from train.toml and writes model.onnx into the project. Preprocessing is baked in: raw feature values in, class scores out.",
  },
  "confusion-matrix": {
    title: "Confusion matrix",
    body: "For each true class (rows), where the model's guesses (columns) landed. The diagonal is correct; bright off-diagonal cells show which classes the model mixes up.",
  },
  duration: {
    title: "Duration",
    body: "Wall-clock time from run start to finish, including data loading and per-epoch evaluation — not just the training math.",
  },
  best: {
    title: "Best value",
    body: "The best this metric got at any point in the run — not necessarily the final value. The \"best\" checkpoint is saved at that moment.",
  },
};

/** Entry lookup; null when the term has no card (render plain text). */
export function explain(term: string): GlossaryEntry | null {
  return GLOSSARY[term] ?? null;
}
