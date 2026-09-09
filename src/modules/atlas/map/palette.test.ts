import { describe, expect, it } from "vitest";
import { tintLanguageForTheme, type Rgb } from "./palette";

const language: Rgb = { r: 80, g: 120, b: 220 };
const warmBrand: Rgb = { r: 230, g: 110, b: 45 };

describe("tintLanguageForTheme", () => {
  it("moves code toward the active theme while retaining its original identity", () => {
    expect(tintLanguageForTheme(language, warmBrand, "code", true)).toEqual({
      r: 137,
      g: 116.2,
      b: 153.5,
    });
  });

  it("keeps inert assets neutral and gives support files a lighter theme cue", () => {
    expect(tintLanguageForTheme(language, warmBrand, "inert", false)).toBe(language);
    const support = tintLanguageForTheme(language, warmBrand, "support", false);
    const code = tintLanguageForTheme(language, warmBrand, "code", false);
    expect(support.r).toBeLessThan(code.r);
    expect(support.b).toBeGreaterThan(code.b);
  });
});
