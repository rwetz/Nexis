// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import { findSecrets } from "@/modules/ai/lib/redact";
import { describeKind, scanDiffForSecrets } from "./secretScan";

// Not real credentials — shaped to match the detectors, nothing more.
const OPENAI = "sk-proj-AAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const AWS = "AKIAIOSFODNN7EXAMPLE";

describe("findSecrets", () => {
  it("reports the detector, the line, and never the secret itself", () => {
    const hits = findSecrets(`harmless\nconst key = "${OPENAI}";\nalso fine`);
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe("openai-key");
    expect(hits[0].line).toBe(2);
    // The whole point: a finding that carried the value would copy it into a
    // UI list, the render tree, and any screenshot of them.
    expect(hits[0].redacted).not.toContain(OPENAI);
    expect(hits[0].context).not.toContain(OPENAI);
    expect(hits[0].redacted).toContain("REDACTED");
  });

  it("finds every match on a line, not just the first", () => {
    const hits = findSecrets(`a=${OPENAI} b=${AWS}`);
    expect(hits.map((h) => h.kind).sort()).toEqual([
      "aws-access-key",
      "openai-key",
    ]);
  });

  /**
   * The pattern list is /g, so `lastIndex` is shared state across calls. A
   * missed reset makes the second scan skip the start of its input, which
   * shows up as findings that vanish when you scan twice.
   */
  it("is repeatable — the global regexes are reset between scans", () => {
    const text = `key = "${OPENAI}"`;
    expect(findSecrets(text)).toHaveLength(findSecrets(text).length);
    expect(findSecrets(text)).toHaveLength(1);
  });

  it("finds nothing in ordinary code", () => {
    expect(findSecrets("const total = items.length; // sk- is not a key")).toEqual(
      [],
    );
  });
});

describe("scanDiffForSecrets", () => {
  const diff = [
    "diff --git a/src/config.ts b/src/config.ts",
    "index 111..222 100644",
    "--- a/src/config.ts",
    "+++ b/src/config.ts",
    "@@ -10,3 +10,4 @@ export const config = {",
    " const a = 1;",
    `+  apiKey: "${OPENAI}",`,
    " const b = 2;",
  ].join("\n");

  it("attributes a finding to the file and the new-file line", () => {
    const hits = scanDiffForSecrets(diff);
    expect(hits).toHaveLength(1);
    expect(hits[0].file).toBe("src/config.ts");
    // Hunk starts at new line 10; one context line precedes the addition.
    expect(hits[0].fileLine).toBe(11);
  });

  /**
   * `apiKey: "sk-proj-..."` trips two detectors. That is one place to go and
   * edit, so it is one row — two rows would read as two problems.
   */
  it("reports one row per line, listing every detector that fired", () => {
    const hits = scanDiffForSecrets(diff);
    expect(hits).toHaveLength(1);
    expect(hits[0].kinds).toContain("openai-key");
    expect(hits[0].kinds).toContain("env-assign");
    expect(hits[0].context).not.toContain(OPENAI);
  });

  /**
   * A secret already on the branch is not something this commit introduces.
   * Flagging it on every unrelated commit that touches the file is how a
   * scanner trains you to ignore it.
   */
  it("scans added lines only, not context or deletions", () => {
    const unchanged = [
      "--- a/x.ts",
      "+++ b/x.ts",
      "@@ -1,2 +1,2 @@",
      ` const key = "${OPENAI}";`,
      `-const old = "${AWS}";`,
      "+const now = 1;",
    ].join("\n");
    expect(scanDiffForSecrets(unchanged)).toEqual([]);
  });

  it("does not attribute anything to a file being deleted", () => {
    const deletion = [
      "--- a/gone.ts",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      `-const key = "${OPENAI}";`,
    ].join("\n");
    expect(scanDiffForSecrets(deletion)).toEqual([]);
  });

  it("keeps counting correctly across several files and hunks", () => {
    const multi = [
      "--- a/one.ts",
      "+++ b/one.ts",
      "@@ -1,1 +1,2 @@",
      " keep",
      `+const a = "${OPENAI}";`,
      "--- a/two.ts",
      "+++ b/two.ts",
      "@@ -50,1 +50,2 @@",
      `+const b = "${AWS}";`,
      " keep",
    ].join("\n");
    const hits = scanDiffForSecrets(multi);
    expect(hits.map((h) => [h.file, h.fileLine])).toEqual([
      ["one.ts", 2],
      ["two.ts", 50],
    ]);
  });

  it("gives a stable fingerprint that does not contain the secret", () => {
    const [a] = scanDiffForSecrets(diff);
    const [b] = scanDiffForSecrets(diff);
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.fingerprint).not.toContain(OPENAI);
    expect(a.fingerprint).toMatch(/^sec-[a-z0-9]+$/);
  });

  it("gives different findings different fingerprints", () => {
    const both = scanDiffForSecrets(
      ["--- a/x", "+++ b/x", "@@ -1 +1,2 @@", `+${OPENAI}`, `+${AWS}`].join("\n"),
    );
    expect(new Set(both.map((h) => h.fingerprint)).size).toBe(2);
  });

  it("survives a truncated diff rather than discarding what it read", () => {
    const cut = [
      "--- a/x.ts",
      "+++ b/x.ts",
      "@@ -1,1 +1,3 @@",
      `+const a = "${OPENAI}";`,
      "+const b = ",
    ].join("\n");
    expect(scanDiffForSecrets(cut)).toHaveLength(1);
  });

  it("finds nothing in an empty diff", () => {
    expect(scanDiffForSecrets("")).toEqual([]);
  });
});

describe("describeKind", () => {
  it("labels every detector the scanner can emit", () => {
    const kinds = new Set(
      findSecrets(
        [
          `sk-proj-${"A".repeat(24)}`,
          `sk-ant-${"A".repeat(24)}`,
          AWS,
          `ghp_${"a".repeat(36)}`,
          `github_pat_${"a".repeat(40)}`,
          `AIza${"a".repeat(35)}`,
          `xoxb-${"1".repeat(12)}`,
          `sk_live_${"a".repeat(24)}`,
          `eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4f`,
          `Bearer ${"a".repeat(24)}`,
          `API_KEY=hunter2hunter2`,
        ].join("\n"),
      ).map((h) => h.kind),
    );
    expect(kinds.size).toBe(11);
    for (const k of kinds) {
      expect(describeKind(k), k).not.toBe(k);
    }
  });

  it("falls back to the raw kind for anything unlabelled", () => {
    expect(describeKind("future-detector")).toBe("future-detector");
  });
});
