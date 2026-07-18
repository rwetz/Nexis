// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import { redactSensitive } from "./redact";

// Test fixtures are synthetic key-shaped strings, not real credentials.
const CASES: Array<{ name: string; input: string; leaks: string }> = [
  {
    name: "openai key",
    input: `export KEY=sk-${"a1B2".repeat(10)}`,
    leaks: `sk-${"a1B2".repeat(10)}`,
  },
  {
    name: "openai project key",
    input: `sk-proj-${"x9".repeat(15)} in output`,
    leaks: `sk-proj-${"x9".repeat(15)}`,
  },
  {
    name: "anthropic key",
    input: `ANTHROPIC_API_KEY=sk-ant-${"q7".repeat(14)}`,
    leaks: `sk-ant-${"q7".repeat(14)}`,
  },
  {
    name: "aws access key id",
    input: "aws configure set AKIAIOSFODNN7EXAMPLE",
    leaks: "AKIAIOSFODNN7EXAMPLE",
  },
  {
    name: "github token",
    input: `git remote set-url origin https://ghp_${"Ab1".repeat(12)}@github.com/x/y`,
    leaks: `ghp_${"Ab1".repeat(12)}`,
  },
  {
    name: "github fine-grained pat",
    input: `token: github_pat_${"Z8_".repeat(14)}end`,
    leaks: `github_pat_${"Z8_".repeat(14)}`,
  },
  {
    name: "google api key",
    input: `key=AIza${"Sy9-_".repeat(7)}`,
    leaks: `AIza${"Sy9-_".repeat(7)}`,
  },
  {
    name: "slack token",
    input: `SLACK_TOKEN=xoxb-12345678901-abcDEF`,
    leaks: "xoxb-12345678901-abcDEF",
  },
  {
    name: "stripe key",
    input: `sk_live_${"4eC9".repeat(7)}`,
    leaks: `sk_live_${"4eC9".repeat(7)}`,
  },
  {
    name: "jwt",
    input: `Authorization uses eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abcDEF123_-xyz`,
    leaks: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abcDEF123_-xyz",
  },
  {
    name: "bearer header",
    input: `curl -H "Authorization: Bearer ${"tok3n".repeat(6)}"`,
    leaks: `Bearer ${"tok3n".repeat(6)}`,
  },
  {
    name: "env assignment",
    input: `DATABASE_PASSWORD=hunter2secret`,
    leaks: "hunter2secret",
  },
  {
    name: "env assignment with quotes",
    input: `MY_CLIENT_SECRET="s3cr3t-value"`,
    leaks: "s3cr3t-value",
  },
];

describe("redactSensitive — every key shape is scrubbed", () => {
  for (const c of CASES) {
    it(`redacts ${c.name}`, () => {
      const out = redactSensitive(c.input);
      expect(out).not.toContain(c.leaks);
      expect(out).toMatch(/REDACTED/);
    });
  }
});

describe("redactSensitive — no false positives on ordinary output", () => {
  const CLEAN = [
    "ls -la /home/me/projects",
    "error TS2345: Argument of type 'string' is not assignable",
    "commit 61c9327f3aa02 (HEAD -> main)",
    // Short sk- prefix that is not key-shaped.
    "task sk-12 done",
    // The word password alone, without an assignment.
    "Enter password:",
  ];
  for (const line of CLEAN) {
    it(`leaves "${line.slice(0, 40)}" alone`, () => {
      expect(redactSensitive(line)).toBe(line);
    });
  }

  it("is idempotent", () => {
    const once = redactSensitive("KEY=sk-" + "a1B2".repeat(10));
    expect(redactSensitive(once)).toBe(once);
  });

  it("over-redacts PASSWORD_*-named config values by design (fail-closed)", () => {
    // `PASSWORD_MIN_LENGTH=8` is not a secret, but the env-assign pattern
    // deliberately redacts anything under a PASSWORD/SECRET/TOKEN-shaped
    // name: a missed real secret is far worse than a scrubbed number.
    expect(redactSensitive("PASSWORD_MIN_LENGTH=8")).toContain("REDACTED");
  });
});
