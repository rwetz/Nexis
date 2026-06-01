import { describe, expect, it } from "vitest";
import { terminalWordNavigationSequence } from "./keymap";

describe("terminalWordNavigationSequence", () => {
  it("maps Option+Left to readline word-left", () => {
    expect(
      terminalWordNavigationSequence({
        altKey: true,
        ctrlKey: false,
        metaKey: false,
        key: "ArrowLeft",
        code: "ArrowLeft",
      }),
    ).toBe("\x1bb");
  });

  it("maps Option+Right to readline word-right", () => {
    expect(
      terminalWordNavigationSequence({
        altKey: true,
        ctrlKey: false,
        metaKey: false,
        key: "ArrowRight",
        code: "ArrowRight",
      }),
    ).toBe("\x1bf");
  });

  it("does not remap plain arrows (no Alt)", () => {
    expect(
      terminalWordNavigationSequence({
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        key: "ArrowLeft",
        code: "ArrowLeft",
      }),
    ).toBeNull();
  });

  it("does not remap Ctrl+Alt combinations", () => {
    expect(
      terminalWordNavigationSequence({
        altKey: true,
        ctrlKey: true,
        metaKey: false,
        key: "ArrowLeft",
        code: "ArrowLeft",
      }),
    ).toBeNull();
  });

  it("does not remap Meta+Alt combinations", () => {
    expect(
      terminalWordNavigationSequence({
        altKey: true,
        ctrlKey: false,
        metaKey: true,
        key: "ArrowLeft",
        code: "ArrowLeft",
      }),
    ).toBeNull();
  });

  it("returns null for non-arrow keys even with Alt", () => {
    expect(
      terminalWordNavigationSequence({
        altKey: true,
        ctrlKey: false,
        metaKey: false,
        key: "a",
        code: "KeyA",
      }),
    ).toBeNull();
  });
});
