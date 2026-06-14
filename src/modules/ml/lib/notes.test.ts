// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import { parseRunMeta, emptyMeta } from "./notes";

describe("parseRunMeta", () => {
  it("reads a well-formed note/tags/pinned object", () => {
    expect(
      parseRunMeta({ note: "best so far", tags: ["baseline", "lr-0.01"], pinned: true }),
    ).toEqual({ note: "best so far", tags: ["baseline", "lr-0.01"], pinned: true });
  });

  it("drops non-string tags and coerces missing fields", () => {
    expect(parseRunMeta({ tags: ["ok", 5, null, "two"] })).toEqual({
      note: "",
      tags: ["ok", "two"],
      pinned: false,
    });
  });

  it("falls back to empty on garbage / non-objects", () => {
    expect(parseRunMeta(null)).toEqual(emptyMeta());
    expect(parseRunMeta("nope")).toEqual(emptyMeta());
    expect(parseRunMeta({ pinned: "yes" })).toEqual(emptyMeta()); // only true counts
  });
});
