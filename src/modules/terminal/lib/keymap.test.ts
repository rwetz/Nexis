// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import {
  terminalPromptJumpDirection,
  terminalWordNavigationSequence,
} from "./keymap";

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

describe("terminalPromptJumpDirection", () => {
  const base = {
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    key: "ArrowUp",
    code: "ArrowUp",
  };

  it("maps Ctrl+Shift+Up/Down to previous/next prompt off macOS", () => {
    expect(
      terminalPromptJumpDirection({ ...base, ctrlKey: true, shiftKey: true }, false),
    ).toBe(-1);
    expect(
      terminalPromptJumpDirection(
        { ...base, ctrlKey: true, shiftKey: true, key: "ArrowDown", code: "ArrowDown" },
        false,
      ),
    ).toBe(1);
  });

  it("maps Cmd+Shift+Up/Down on macOS", () => {
    expect(
      terminalPromptJumpDirection({ ...base, metaKey: true, shiftKey: true }, true),
    ).toBe(-1);
    expect(
      terminalPromptJumpDirection(
        { ...base, metaKey: true, shiftKey: true, key: "ArrowDown", code: "ArrowDown" },
        true,
      ),
    ).toBe(1);
  });

  it("ignores the other platform's modifier", () => {
    expect(
      terminalPromptJumpDirection({ ...base, metaKey: true, shiftKey: true }, false),
    ).toBeNull();
    expect(
      terminalPromptJumpDirection({ ...base, ctrlKey: true, shiftKey: true }, true),
    ).toBeNull();
  });

  it("requires Shift, so plain Ctrl+Up still reaches the PTY", () => {
    expect(terminalPromptJumpDirection({ ...base, ctrlKey: true }, false)).toBeNull();
  });

  it("ignores chords with Alt and non-arrow keys", () => {
    expect(
      terminalPromptJumpDirection(
        { ...base, ctrlKey: true, shiftKey: true, altKey: true },
        false,
      ),
    ).toBeNull();
    expect(
      terminalPromptJumpDirection(
        { ...base, ctrlKey: true, shiftKey: true, key: "k", code: "KeyK" },
        false,
      ),
    ).toBeNull();
  });
});
