// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import { packForView } from "@/lib/packs";
import { matchBinding, SHORTCUTS, type KeyBinding } from "./shortcuts";

/** matchBinding only reads key + modifier flags, so a plain object works. */
function key(
  k: string,
  mods: Partial<Pick<KeyboardEvent, "ctrlKey" | "shiftKey" | "altKey" | "metaKey">> = {},
): KeyboardEvent {
  return {
    key: k,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...mods,
  } as KeyboardEvent;
}

describe("matchBinding", () => {
  const ctrlShiftR: KeyBinding = { ctrl: true, shift: true, key: "r" };

  it("requires every modifier to match exactly — extra or missing fails", () => {
    expect(matchBinding(key("r", { ctrlKey: true, shiftKey: true }), ctrlShiftR)).toBe(true);
    // Missing shift → no match (this is Ctrl+R, the private-tab binding).
    expect(matchBinding(key("r", { ctrlKey: true }), ctrlShiftR)).toBe(false);
    // Extra alt → no match.
    expect(
      matchBinding(key("r", { ctrlKey: true, shiftKey: true, altKey: true }), ctrlShiftR),
    ).toBe(false);
  });

  it("compares keys case-insensitively (Shift produces uppercase event keys)", () => {
    expect(matchBinding(key("R", { ctrlKey: true, shiftKey: true }), ctrlShiftR)).toBe(true);
  });

  it("tab.selectByIndex matches any digit 1-9 but nothing else", () => {
    const binding: KeyBinding = { ctrl: true, key: "1" };
    for (const d of ["1", "5", "9"]) {
      expect(
        matchBinding(key(d, { ctrlKey: true }), binding, "tab.selectByIndex"),
      ).toBe(true);
    }
    expect(
      matchBinding(key("0", { ctrlKey: true }), binding, "tab.selectByIndex"),
    ).toBe(false);
    expect(
      matchBinding(key("a", { ctrlKey: true }), binding, "tab.selectByIndex"),
    ).toBe(false);
  });
});

describe("SHORTCUTS registry", () => {
  it("has no duplicate ids", () => {
    const ids = SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("no two shortcuts share an identical default binding", () => {
    // Two actions silently fighting over one chord is always a bug; the
    // first registry entry would shadow the second in useGlobalShortcuts.
    const seen = new Map<string, string>();
    for (const s of SHORTCUTS) {
      for (const b of s.defaultBindings) {
        // displayOnly entries intentionally mirror keys owned elsewhere
        // (e.g. CodeMirror's undo/redo); only real handlers can conflict.
        if (s.displayOnly) continue;
        const sig = [b.ctrl, b.shift, b.alt, b.meta, b.key.toLowerCase()].join("|");
        const owner = seen.get(sig);
        expect(
          owner,
          `binding conflict: ${s.id} and ${owner} both default to ${sig}`,
        ).toBeUndefined();
        seen.set(sig, s.id);
      }
    }
  });

  it("editor.codeActions is rebindable (not displayOnly) with Ctrl+Shift+R default", () => {
    const s = SHORTCUTS.find((x) => x.id === "editor.codeActions");
    expect(s).toBeDefined();
    expect(s?.displayOnly).toBeUndefined();
    expect(s?.defaultBindings[0]).toMatchObject({ shift: true, key: "r" });
  });

  it("shortcuts that target a pack-owned sidebar view carry that view's pack", () => {
    // These handlers open (or write to a store surfaced only by) a
    // pack-owned sidebar view. Tagging them keeps the binding inert and
    // hidden while the pack is disabled — otherwise the key would open a
    // panel the rail no longer offers (the V1 gating leak).
    const owned: Record<string, Parameters<typeof packForView>[0]> = {
      "repl.sendSelection": "repl",
      "refactor.captureSelection": "refactor",
      "bookmark.toggle": "bookmarks",
    };
    for (const [id, view] of Object.entries(owned)) {
      const s = SHORTCUTS.find((x) => x.id === id);
      expect(s, `${id} missing from SHORTCUTS`).toBeDefined();
      expect(s?.pack, `${id} must be owned by packForView("${view}")`).toBe(
        packForView(view),
      );
    }
  });
});
