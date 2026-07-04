// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import { explain, GLOSSARY } from "./glossary";
import { HP_FIELDS } from "./hyperparams";

describe("ML glossary", () => {
  // Tripwire: the panel promises hover-to-explain on every hyperparameter
  // knob. A new HP_FIELDS entry without a glossary card fails here instead
  // of shipping an unexplained control.
  it("every hyperparameter field has an explanation card", () => {
    for (const f of HP_FIELDS) {
      const entry = explain(f.key);
      expect(entry, `missing glossary entry for train.toml key "${f.key}"`).not.toBeNull();
    }
  });

  it("entries are substantive (title + a real sentence)", () => {
    for (const [key, entry] of Object.entries(GLOSSARY)) {
      expect(entry.title.length, `empty title for "${key}"`).toBeGreaterThan(2);
      expect(entry.body.length, `body too thin for "${key}"`).toBeGreaterThan(40);
    }
  });

  it("unknown terms return null so callers render plain text", () => {
    expect(explain("not-a-term")).toBeNull();
  });
});
