// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import { displayToRaw, rawToDisplay } from "./hyperparams";

describe("hyperparam value conversions", () => {
  it("round-trips ints", () => {
    expect(rawToDisplay("int", "10")).toBe("10");
    expect(displayToRaw("int", "10")).toBe("10");
    expect(displayToRaw("int", "1.5")).toBeNull();
    expect(displayToRaw("int", "")).toBeNull();
  });

  it("round-trips floats", () => {
    expect(rawToDisplay("float", "0.001")).toBe("0.001");
    expect(displayToRaw("float", "0.001")).toBe("0.001");
    expect(displayToRaw("float", "abc")).toBeNull();
  });

  it("strips and restores enum quotes", () => {
    expect(rawToDisplay("enum", '"auto"')).toBe("auto");
    expect(displayToRaw("enum", "gpu")).toBe('"gpu"');
  });

  it("round-trips int lists (hidden layer sizes)", () => {
    expect(rawToDisplay("intList", "[64, 32]")).toBe("64, 32");
    expect(displayToRaw("intList", "64, 32")).toBe("[64, 32]");
    expect(displayToRaw("intList", "64, x")).toBeNull();
    expect(displayToRaw("intList", "")).toBeNull();
  });
});
