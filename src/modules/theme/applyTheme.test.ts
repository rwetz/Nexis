// @vitest-environment jsdom
// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { afterEach, describe, expect, it } from "vitest";
import { POPOVER_LIFT, applyTheme, brandOf, clearTheme } from "./applyTheme";
import type { Theme } from "./types";

const css = (v: string) => document.documentElement.style.getPropertyValue(v);

const theme: Theme = {
  id: "t",
  name: "T",
  variants: {
    dark: {
      colors: {
        background: "#101418",
        foreground: "#f0f2f4",
        card: "#181c20",
        popover: "#181c20",
        primary: "#7aa2f7",
        primaryForeground: "#101418",
      },
    },
  },
} as Theme;

afterEach(() => clearTheme());

describe("applyTheme (nexis-design R6.2, R6.6)", () => {
  it("sends the theme's accent to --brand and keeps --primary neutral", () => {
    applyTheme(theme, "dark");
    expect(css("--brand")).toBe("#7aa2f7");
    expect(css("--primary")).toBe("#f0f2f4");
    expect(css("--primary-foreground")).toBe("#101418");
  });

  it("lifts a dark popover that equals the card", () => {
    applyTheme(theme, "dark");
    expect(css("--popover")).toBe(POPOVER_LIFT);
  });

  it("clears every variable it wrote", () => {
    applyTheme(theme, "dark");
    clearTheme();
    expect(css("--brand")).toBe("");
    expect(css("--brand-foreground")).toBe("");
    expect(css("--primary")).toBe("");
  });
});

describe("brandOf", () => {
  it("puts the theme's own primaryForeground on its accent", () => {
    expect(brandOf({ primary: "#7aa2f7", primaryForeground: "#101418", background: "#101418" })).toEqual({
      brand: "#7aa2f7",
      brandForeground: "#101418",
    });
  });

  it("keeps the stylesheet's white when white reads better", () => {
    expect(brandOf({ primary: "#2050c0", primaryForeground: "#101418" })).toEqual({ brand: "#2050c0" });
  });
});
