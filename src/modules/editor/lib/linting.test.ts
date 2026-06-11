// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import { cppLanguage } from "@codemirror/lang-cpp";
import { javaLanguage } from "@codemirror/lang-java";
import { pythonLanguage } from "@codemirror/lang-python";
import { javascriptLanguage } from "@codemirror/lang-javascript";
import {
  DELIMITER_CHECK_EXTENSIONS,
  scanDelimiters,
  syntaxErrorRanges,
  type DelimiterProblem,
} from "./linting";

// Most tests don't exercise string/comment skipping, so default to "nothing
// is skippable". Tests that need skipping pass their own predicate.
const noSkip = () => false;

const messages = (problems: DelimiterProblem[]) => problems.map((p) => p.message);

describe("scanDelimiters", () => {
  it("reports nothing for balanced input", () => {
    expect(scanDelimiters("fn(a, b) { return [1, 2]; }", noSkip)).toEqual([]);
  });

  it("flags an unclosed opener at the opener position", () => {
    const text = "void f() {";
    const problems = scanDelimiters(text, noSkip);
    expect(messages(problems)).toEqual(["Unclosed '{'"]);
    expect(problems[0]!.from).toBe(text.indexOf("{"));
  });

  it("flags a closer with no matching opener", () => {
    const problems = scanDelimiters("return x; }", noSkip);
    expect(messages(problems)).toEqual(["Unmatched '}'"]);
  });

  it("flags a mismatched closer", () => {
    const problems = scanDelimiters("foo(a]", noSkip);
    expect(messages(problems)).toEqual(["Mismatched ']' — expected ')'"]);
  });

  it("handles nesting across all three pairs", () => {
    expect(scanDelimiters("a([{}]) { ([]) }", noSkip)).toEqual([]);
  });

  // The whole point of the feature: deleting a brace must be caught.
  it("catches a deleted closing brace in a C#-like snippet", () => {
    const text = "class C {\n  void M() {\n  }\n"; // missing final }
    const problems = scanDelimiters(text, noSkip);
    expect(messages(problems)).toEqual(["Unclosed '{'"]);
    expect(problems[0]!.from).toBe(text.indexOf("{")); // the class brace
  });

  it("ignores brackets the skip predicate marks (strings/comments)", () => {
    // The `}` lives inside a "string"; with it skipped the rest is balanced.
    const text = 'var s = "}"; { ok }';
    const stringBrace = text.indexOf('"}"') + 1;
    const problems = scanDelimiters(text, (pos) => pos === stringBrace);
    expect(problems).toEqual([]);
  });

  it("still flags real imbalance even when some positions are skipped", () => {
    const text = '"{" {';
    const skip = text.indexOf('"') + 1; // the quoted brace
    const problems = scanDelimiters(text, (pos) => pos === skip);
    expect(messages(problems)).toEqual(["Unclosed '{'"]);
  });

  it("caps the number of problems returned", () => {
    const text = "}".repeat(50);
    expect(scanDelimiters(text, noSkip, 5)).toHaveLength(5);
  });
});

// Regression guard for the missing-brace bug: a missing closing delimiter is a
// ZERO-WIDTH error node in every Lezer grammar, so `syntaxErrorRanges` must
// expand it into a visible range. Re-adding a `from < to` filter, or reverting
// C++/Java to the legacy StreamParser, would make these fail — which is exactly
// how the warnings silently vanished before.
const rangesFor = (
  language: { parser: { parse(text: string): Parameters<typeof syntaxErrorRanges>[0] } },
  text: string,
) => syntaxErrorRanges(language.parser.parse(text), text.length);

describe("syntaxErrorRanges — missing-delimiter detection", () => {
  it("flags a missing closing brace in C/C++ as a non-zero-width range", () => {
    const ranges = rangesFor(cppLanguage, "int main() {\n  return 0;\n");
    expect(ranges.length).toBeGreaterThan(0);
    expect(ranges[0]!.to).toBeGreaterThan(ranges[0]!.from);
  });

  it("flags a missing brace in Java", () => {
    expect(rangesFor(javaLanguage, "class C {\n  void m() {\n").length).toBeGreaterThan(0);
  });

  it("flags a missing brace in JavaScript", () => {
    expect(rangesFor(javascriptLanguage, "function f() {\n  return 1;\n").length).toBeGreaterThan(0);
  });

  it("flags a syntax error in Python", () => {
    expect(rangesFor(pythonLanguage, "def f(:\n  return 1\n").length).toBeGreaterThan(0);
  });

  it("produces nothing for well-formed code", () => {
    expect(rangesFor(cppLanguage, "int main() {\n  return 0;\n}\n")).toEqual([]);
    expect(rangesFor(javaLanguage, "class C {\n  void m() {}\n}\n")).toEqual([]);
    expect(rangesFor(javascriptLanguage, "function f() {\n  return 1;\n}\n")).toEqual([]);
  });

  it("expands a zero-width error at end-of-document to underline the last char", () => {
    const text = "function f() {\n  return 1;\n"; // missing brace -> ZW error at EOF
    const ranges = rangesFor(javascriptLanguage, text);
    expect(ranges[0]!.from).toBe(text.length - 1);
    expect(ranges[0]!.to).toBe(text.length);
  });

  it("dedupes error nodes that resolve to the same range", () => {
    // Java emits two coincident zero-width errors for this snippet; we want one.
    const ranges = rangesFor(javaLanguage, "class C {\n  void m() {\n");
    const keys = new Set(ranges.map((r) => `${r.from}:${r.to}`));
    expect(keys.size).toBe(ranges.length);
  });
});

describe("DELIMITER_CHECK_EXTENSIONS", () => {
  it("includes brace-structured StreamParser languages", () => {
    for (const ext of ["cs", "kt", "lua", "rb", "ps1", "swift"]) {
      expect(DELIMITER_CHECK_EXTENSIONS.has(ext)).toBe(true);
    }
  });

  it("excludes Lezer-backed and false-positive-prone languages", () => {
    // Lezer grammars (own error nodes), shell (`case x)`), and markup must
    // not be brace-checked.
    for (const ext of ["ts", "py", "rs", "java", "cpp", "c", "sh", "bash", "md", "html"]) {
      expect(DELIMITER_CHECK_EXTENSIONS.has(ext)).toBe(false);
    }
  });
});
