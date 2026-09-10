// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveCssColor } from "./tokens";

const originalGetComputedStyle = globalThis.getComputedStyle;
const originalGetContext = HTMLCanvasElement.prototype.getContext;

afterEach(() => {
  globalThis.getComputedStyle = originalGetComputedStyle;
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  document.body.replaceChildren();
});

describe("resolveCssColor", () => {
  it("normalizes WebKit's preserved OKLCH serialization to sRGB", () => {
    globalThis.getComputedStyle = vi.fn(() => ({ color: "oklch(0.148 0.004 228.8)" })) as never;
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      fillStyle: "",
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([30, 31, 32, 255]) })),
    })) as never;

    expect(resolveCssColor("var(--background)")).toBe("rgb(30, 31, 32)");
  });
});
