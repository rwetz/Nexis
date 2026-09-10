import { describe, expect, it } from "vitest";
import { creationOverrides } from "./model-blueprint";

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
