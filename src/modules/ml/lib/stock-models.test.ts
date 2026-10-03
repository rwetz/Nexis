// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import { HP_FIELDS } from "./hyperparams";
import { parseTomlNet } from "./netspec";
import { STOCK_MODELS, datasetOverrides, stockBrief, stockModel } from "./stock-models";
import { STARTER_DATASETS } from "./starter-data";

const KEYS_BY_FAMILY: Record<string, Set<string>> = {
  tabular: new Set(["hidden"]),
  image: new Set(["conv1", "conv2", "hidden"]),
  textgen: new Set(["context", "embed", "heads", "layers"]),
};

describe("stock networks", () => {
  it("have unique ids and names that are valid project dirs", () => {
    const ids = STOCK_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of STOCK_MODELS) expect(m.name).toMatch(/^[a-z0-9][a-z0-9-]*$/);
  });

  it("only set [model] keys their engine family documents", () => {
    for (const m of STOCK_MODELS) {
      for (const o of m.config.filter((c) => c.section === "model")) {
        expect(KEYS_BY_FAMILY[m.family].has(o.key), `${m.id} sets ${o.key}`).toBe(true);
      }
      // and every knob it sets is editable in the hyperparameter form
      for (const o of m.config) {
        expect(HP_FIELDS.some((f) => f.section === o.section && f.key === o.key)).toBe(true);
      }
    }
  });

  it("keep transformer width divisible by heads", () => {
    for (const m of STOCK_MODELS.filter((s) => s.family === "textgen")) {
      const v = (k: string) => Number(m.config.find((c) => c.key === k)?.value);
      expect(v("embed") % v("heads"), m.id).toBe(0);
    }
  });

  it("draw as the network the card advertises", () => {
    for (const m of STOCK_MODELS) {
      const toml = ["[model]", ...m.config.filter((c) => c.section === "model").map((c) => `${c.key} = ${c.value}`)].join("\n");
      const net = parseTomlNet(toml);
      const expected = { tabular: "mlp", image: "cnn", textgen: "gpt" }[m.family];
      if (m.id === "linear-baseline") {
        expect(net).toBeNull(); // hidden = [] has no layers to draw
      } else {
        expect(net?.kind, m.id).toBe(expected);
      }
    }
  });

  it("starters are tabular and point [data] at their dataset", () => {
    for (const m of STOCK_MODELS.filter((s) => s.group === "starter")) {
      expect(m.family).toBe("tabular");
      expect(m.dataset).toBeDefined();
      const paths = datasetOverrides(m).map((o) => o.value);
      expect(paths).toContain(`"${STARTER_DATASETS[m.dataset!].path}"`);
    }
  });

  it("write a brief with the class table", () => {
    const brief = stockBrief(stockModel("goat-ranker")!, "");
    expect(brief).toContain("| 3 | all-time great |");
    expect(brief).toContain("synthetic");
  });
});
