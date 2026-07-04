// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import {
  csvHeaderFeatures,
  parseDataConfig,
  parseSizes,
  parseTomlNet,
} from "./netspec";

const TABULAR_TOML = `
# my model
[data]
path = "data/example.csv"
target = "label"

[train]
epochs = 15
device = "auto"

[model]
hidden = [64, 32]
`;

const TABULAR_SCALAR_HIDDEN = `
[data]
path = "data/example.csv"
target = "y"
[model]
hidden = 16
`;

const IMAGE_TOML = `
[data]
path = "data/images"
[model]
conv1 = 8
conv2 = 16
hidden = 64
`;

const TEXTGEN_TOML = `
[data]
path = "data/corpus.txt"
[model]
context = 128
embed = 64
heads = 4
layers = 4
`;

describe("parseTomlNet", () => {
  it("parses a tabular MLP with a hidden list", () => {
    expect(parseTomlNet(TABULAR_TOML)).toEqual({ kind: "mlp", hidden: [64, 32] });
  });

  it("parses a scalar hidden (Rust engine shorthand)", () => {
    expect(parseTomlNet(TABULAR_SCALAR_HIDDEN)).toEqual({ kind: "mlp", hidden: [16] });
  });

  it("detects the CNN template from conv keys", () => {
    expect(parseTomlNet(IMAGE_TOML)).toEqual({
      kind: "cnn",
      conv: [8, 16],
      hidden: [64],
    });
  });

  it("detects the tiny-GPT template from context/embed/layers", () => {
    expect(parseTomlNet(TEXTGEN_TOML)).toEqual({
      kind: "gpt",
      context: 128,
      embed: 64,
      heads: 4,
      layers: 4,
    });
  });

  it("returns null when no [model] shape keys exist", () => {
    expect(parseTomlNet("[train]\nepochs = 3\n")).toBeNull();
  });
});

describe("parseSizes", () => {
  it("handles list, scalar, and garbage", () => {
    expect(parseSizes("[64, 32]")).toEqual([64, 32]);
    expect(parseSizes("16")).toEqual([16]);
    expect(parseSizes("[64, x]")).toBeNull();
    expect(parseSizes("[]")).toBeNull();
    expect(parseSizes(null)).toBeNull();
  });
});

describe("parseDataConfig", () => {
  it("strips quotes from path and target", () => {
    expect(parseDataConfig(TABULAR_TOML)).toEqual({
      path: "data/example.csv",
      target: "label",
    });
  });

  it("returns nulls when the section is absent", () => {
    expect(parseDataConfig("[train]\nepochs = 1\n")).toEqual({
      path: null,
      target: null,
    });
  });
});

describe("csvHeaderFeatures", () => {
  it("drops the target column", () => {
    expect(csvHeaderFeatures("a,b,c,label", "label")).toEqual(["a", "b", "c"]);
  });

  it("keeps all columns without a target", () => {
    expect(csvHeaderFeatures("x, y", null)).toEqual(["x", "y"]);
  });

  it("bails on quoted or degenerate headers", () => {
    expect(csvHeaderFeatures('"a,b",c', "c")).toBeNull();
    expect(csvHeaderFeatures("only", null)).toBeNull();
    expect(csvHeaderFeatures("a,,b", null)).toBeNull();
  });
});
