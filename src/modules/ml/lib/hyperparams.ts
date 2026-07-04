// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The editable train.toml knobs and their display/TOML conversions.
 * Pure data + functions (no React/Tauri) so the field list and the
 * conversions are unit-testable, and so the glossary test can enforce
 * that every knob shown in the panel has a hover explanation.
 */

export type HpType = "int" | "float" | "enum" | "intList";

export type HpField = {
  section: string;
  key: string;
  label: string;
  type: HpType;
  options?: string[];
};

// Editable knobs across templates. Only fields actually present in the
// project's train.toml are rendered, so this one list covers both
// tabular and textgen (and any future template that reuses these keys).
export const HP_FIELDS: HpField[] = [
  { section: "train", key: "epochs", label: "Passes (epochs)", type: "int" },
  { section: "train", key: "steps_per_epoch", label: "Steps per pass", type: "int" },
  { section: "train", key: "batch_size", label: "Batch size", type: "int" },
  { section: "train", key: "lr", label: "Learning rate", type: "float" },
  { section: "train", key: "val_split", label: "Validation split", type: "float" },
  { section: "train", key: "seed", label: "Seed", type: "int" },
  {
    section: "train",
    key: "device",
    label: "Device",
    type: "enum",
    options: ["auto", "cpu", "gpu"],
  },
  { section: "model", key: "hidden", label: "Hidden layers", type: "intList" },
  { section: "model", key: "context", label: "Context (chars)", type: "int" },
  { section: "model", key: "embed", label: "Model width", type: "int" },
  { section: "model", key: "heads", label: "Attention heads", type: "int" },
  { section: "model", key: "layers", label: "Layers", type: "int" },
  { section: "sample", key: "temperature", label: "Sampling temp", type: "float" },
  { section: "sample", key: "length", label: "Sample length", type: "int" },
];

export const fieldId = (f: HpField) => `${f.section}.${f.key}`;

export function rawToDisplay(type: HpType, raw: string): string {
  if (type === "enum") return raw.replace(/^"|"$/g, "");
  if (type === "intList") return raw.replace(/^\[|\]$/g, "").trim();
  return raw.trim();
}

/** Display string → TOML raw value, or null if invalid for the type. */
export function displayToRaw(type: HpType, display: string): string | null {
  const d = display.trim();
  if (type === "int") {
    return d !== "" && Number.isInteger(Number(d)) ? String(Number(d)) : null;
  }
  if (type === "float") {
    return d !== "" && Number.isFinite(Number(d)) ? d : null;
  }
  if (type === "enum") return `"${d}"`;
  const parts = d.split(",").map((p) => p.trim()).filter(Boolean);
  const nums = parts.map(Number);
  if (parts.length === 0 || !nums.every((n) => Number.isInteger(n))) return null;
  return `[${nums.join(", ")}]`;
}
