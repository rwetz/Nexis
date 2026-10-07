import { describe, expect, it } from "vitest";
import { applyOverrides, creationOverrides } from "./model-blueprint";
import { planCreation, stockModel } from "./stock-models";

describe("creationOverrides", () => {
  it("keeps each GPT-style architecture internally compatible", () => {
    for (const scale of ["starter", "balanced", "ambitious"] as const) {
      const values = new Map(creationOverrides("textgen", scale).map((item) => [item.key, Number(item.value)]));
      expect(values.get("embed")! % values.get("heads")!).toBe(0);
      expect(values.get("layers")).toBeGreaterThan(0);
    }
  });

  it("does not invent transformer keys for non-text templates", () => {
    expect(creationOverrides("tabular", "balanced").map((item) => item.key)).not.toContain("heads");
  });
});

describe("planCreation", () => {
  it("lets a stock network's size win over the scale's GPT size", () => {
    const plan = planCreation("textgen", "ambitious", stockModel("nano-gpt"));
    const get = (k: string) => plan.find((o) => o.key === k)?.value;
    expect(get("embed")).toBe("32");
    expect(get("layers")).toBe("1");
    expect(get("epochs")).toBe("200"); // budget still comes from the scale
    expect(plan.filter((o) => o.key === "embed")).toHaveLength(1);
  });

  it("points [data] at a starter's CSV with upserts", () => {
    const plan = planCreation("tabular", "starter", stockModel("goat-ranker"));
    expect(plan).toContainEqual({ section: "data", key: "path", value: '"data/players.csv"', upsert: true });
    expect(plan).toContainEqual({ section: "data", key: "target", value: '"tier"', upsert: true });
  });

  it("is the plain scale plan with no stock network", () => {
    expect(planCreation("tabular", "balanced")).toEqual(creationOverrides("tabular", "balanced"));
  });
});

describe("applyOverrides", () => {
  const rustScaffold = "[train]\nepochs = 30\nlr = 0.2\n\n[model]\nhidden = [16]\n";

  it("writes known keys, upserts data, and reports keys the scaffold lacks", () => {
    const { text, skipped } = applyOverrides(rustScaffold, planCreation("tabular", "starter", stockModel("goat-ranker")));
    expect(text).toContain("hidden = [64, 32]");
    expect(text).toContain("epochs = 20");
    expect(text).toContain('path = "data/players.csv"');
    // the Rust scaffold has no batch_size, so it's reported, not invented
    expect(skipped.map((o) => o.key)).toEqual(["batch_size"]);
  });
});
