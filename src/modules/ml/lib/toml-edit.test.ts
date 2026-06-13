// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import { tomlGet, tomlSet } from "./toml-edit";

const SAMPLE = `# Hyperparameters
[data]
path = "data/example.csv"
target = "label"

[model]
hidden = [32, 16]           # hidden layer sizes

[train]
epochs = 15
lr = 0.01
device = "auto"             # auto | cpu | gpu
`;

describe("tomlGet", () => {
  it("reads scalars, quoted strings, and arrays from the right section", () => {
    expect(tomlGet(SAMPLE, "train", "epochs")).toBe("15");
    expect(tomlGet(SAMPLE, "train", "lr")).toBe("0.01");
    expect(tomlGet(SAMPLE, "train", "device")).toBe('"auto"');
    expect(tomlGet(SAMPLE, "model", "hidden")).toBe("[32, 16]");
    expect(tomlGet(SAMPLE, "data", "path")).toBe('"data/example.csv"');
  });

  it("is section-scoped and returns null for missing keys", () => {
    expect(tomlGet(SAMPLE, "data", "epochs")).toBeNull();
    expect(tomlGet(SAMPLE, "train", "missing")).toBeNull();
  });
});

describe("tomlSet", () => {
  it("replaces a value while preserving the trailing comment", () => {
    const out = tomlSet(SAMPLE, "train", "device", '"gpu"');
    expect(out).toContain('device = "gpu"  # auto | cpu | gpu');
    expect(tomlGet(out, "train", "device")).toBe('"gpu"');
  });

  it("edits only the targeted section/key, leaving the rest byte-identical", () => {
    const out = tomlSet(SAMPLE, "train", "epochs", "40");
    expect(tomlGet(out, "train", "epochs")).toBe("40");
    // every other line is untouched
    expect(out).toContain('path = "data/example.csv"');
    expect(out).toContain("hidden = [32, 16]           # hidden layer sizes");
    expect(out).toContain("lr = 0.01");
  });

  it("rewrites an array value", () => {
    const out = tomlSet(SAMPLE, "model", "hidden", "[64, 32, 16]");
    expect(tomlGet(out, "model", "hidden")).toBe("[64, 32, 16]");
  });

  it("returns the text unchanged when the key is absent", () => {
    expect(tomlSet(SAMPLE, "train", "nope", "1")).toBe(SAMPLE);
  });

  it("preserves CRLF line endings", () => {
    const crlf = SAMPLE.replace(/\n/g, "\r\n");
    const out = tomlSet(crlf, "train", "epochs", "9");
    expect(out).toContain("\r\n");
    expect(out).not.toMatch(/[^\r]\n/);
  });
});
