import { describe, expect, it, vi } from "vitest";
import { exportLumenPalette, importLumenPalette } from "./lumenExchange";

vi.mock("@/styles/tokens", () => ({
  resolveCssColor: (expr: string) => ({
    "var(--background)": "rgb(16, 32, 48)",
    "var(--primary)": "rgb(170, 187, 204)",
    "var(--secondary)": "rgb(1, 2, 3)",
    "var(--muted)": "rgb(4, 5, 6)",
    "var(--foreground)": "rgb(255, 255, 255)",
  } as Record<string, string>)[expr],
}));

const payload = { format: "nexis-lumen-palette", version: 1, palette: { name: "Sky", colors: ["#102030", "#aabbcc"] } };

describe("Lumen palette exchange", () => {
  it("exports the resolved theme colors in the contract order", () => {
    expect(exportLumenPalette("Nexis").palette).toEqual({
      name: "Nexis", colors: ["#102030", "#aabbcc", "#010203", "#040506", "#ffffff"],
    });
  });
  it("creates an independent theme with readable text colors", () => {
    const first = importLumenPalette(payload);
    const second = importLumenPalette(payload);
    expect(first.id).not.toBe(second.id);
    expect(first.variants.dark?.colors).toMatchObject({ background: "#102030", foreground: "#ffffff", primary: "#aabbcc", primaryForeground: "#000000" });
  });

  it("rejects unknown versions and malformed colors", () => {
    expect(() => importLumenPalette({ ...payload, version: 2 })).toThrow();
    expect(() => importLumenPalette({ ...payload, palette: { name: "Bad", colors: ["red", "#aabbcc"] } })).toThrow();
  });

  it("uses a light variant for a bright background", () => {
    const theme = importLumenPalette({ ...payload, palette: { name: "Day", colors: ["#ffffff", "#102030"] } });
    expect(theme.variants.light?.colors).toMatchObject({ background: "#ffffff", foreground: "#000000" });
  });

  it("imports the palette from a scene snapshot", () => {
    const theme = importLumenPalette({ ...payload, format: "nexis-lumen-scene", scene: { generator: "fluid" } });
    expect(theme.variants.dark?.colors?.primary).toBe("#aabbcc");
  });
});
