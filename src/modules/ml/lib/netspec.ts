// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Derive the network's architecture from a project's train.toml — the
 * data source the panel already has for every project, on both engines,
 * before any training has happened. Pure functions (no React/Tauri) so
 * the parsing is unit-testable.
 *
 * Template detection mirrors the engines' own rules:
 *  - `[model] conv1` present            → CNN (image template)
 *  - `[model] context`/`embed`/`layers` → tiny GPT (textgen template)
 *  - otherwise                          → MLP (tabular; `hidden` sizes)
 */
import { tomlGet } from "./toml-edit";

export type TomlNet =
  | { kind: "mlp"; hidden: number[] }
  | { kind: "cnn"; conv: number[]; hidden: number[] }
  | {
      kind: "gpt";
      context: number | null;
      embed: number | null;
      heads: number | null;
      layers: number | null;
    };

/** `"[64, 32]"` or `"16"` → `[64, 32]` / `[16]`; null on anything else. */
export function parseSizes(raw: string | null): number[] | null {
  if (raw == null) return null;
  const inner = raw.trim().replace(/^\[|\]$/g, "");
  if (inner === "") return null;
  const parts = inner.split(",").map((p) => Number(p.trim()));
  if (parts.length === 0 || !parts.every((n) => Number.isInteger(n) && n > 0)) {
    return null;
  }
  return parts;
}

function intOf(raw: string | null): number | null {
  if (raw == null) return null;
  const n = Number(raw.trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function parseTomlNet(toml: string): TomlNet | null {
  const conv1 = intOf(tomlGet(toml, "model", "conv1"));
  if (conv1 != null) {
    const conv2 = intOf(tomlGet(toml, "model", "conv2"));
    return {
      kind: "cnn",
      conv: conv2 != null ? [conv1, conv2] : [conv1],
      hidden: parseSizes(tomlGet(toml, "model", "hidden")) ?? [],
    };
  }
  const context = intOf(tomlGet(toml, "model", "context"));
  const embed = intOf(tomlGet(toml, "model", "embed"));
  const layers = intOf(tomlGet(toml, "model", "layers"));
  if (context != null || embed != null || layers != null) {
    return {
      kind: "gpt",
      context,
      embed,
      heads: intOf(tomlGet(toml, "model", "heads")),
      layers,
    };
  }
  const hidden = parseSizes(tomlGet(toml, "model", "hidden"));
  if (hidden) return { kind: "mlp", hidden };
  return null;
}

/** `[data]` section: where the training data lives + the label column. */
export function parseDataConfig(toml: string): {
  path: string | null;
  target: string | null;
} {
  const strip = (raw: string | null) =>
    raw == null ? null : raw.trim().replace(/^"|"$/g, "") || null;
  return {
    path: strip(tomlGet(toml, "data", "path")),
    target: strip(tomlGet(toml, "data", "target")),
  };
}

/**
 * Input feature names from a CSV header line: every column except the
 * target. Handles the simple comma-separated headers the templates write;
 * quoted/escaped headers fall back to null (draw unnamed inputs).
 */
export function csvHeaderFeatures(
  headerLine: string,
  target: string | null,
): string[] | null {
  const line = headerLine.trim();
  if (!line || line.includes('"')) return null;
  const cols = line.split(",").map((c) => c.trim());
  if (cols.length < 2 || cols.some((c) => c === "")) return null;
  const features = target ? cols.filter((c) => c !== target) : cols;
  return features.length > 0 ? features : null;
}
