// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import {
  hoverToMarkdown,
  lspSeverityToCm,
  pathToUri,
  uriToPath,
} from "./protocol";

describe("pathToUri", () => {
  it("maps a Windows drive path to file:/// with forward slashes", () => {
    expect(pathToUri("C:\\Users\\dev\\main.rs")).toBe(
      "file:///C:/Users/dev/main.rs",
    );
    expect(pathToUri("E:/Nexis/src/App.tsx")).toBe(
      "file:///E:/Nexis/src/App.tsx",
    );
  });

  it("maps a Unix path to file:// with two slashes", () => {
    expect(pathToUri("/home/dev/main.rs")).toBe("file:///home/dev/main.rs");
  });
});

describe("uriToPath", () => {
  it("strips the scheme for Windows and Unix forms", () => {
    expect(uriToPath("file:///C:/Users/dev/main.rs")).toBe(
      "C:/Users/dev/main.rs",
    );
    expect(uriToPath("file:///home/dev/main.rs")).toBe("/home/dev/main.rs");
  });

  it("percent-decodes spaces and encoded drive colons", () => {
    // rust-analyzer and ts-ls both emit lowercase percent-encoded drives.
    expect(uriToPath("file:///e%3A/My%20Project/x.ts")).toBe(
      "e:/My Project/x.ts",
    );
  });

  it("round-trips a Windows path through pathToUri", () => {
    const path = "C:/Users/dev/some dir/file name.ts";
    // pathToUri does not percent-encode; uriToPath must still return the
    // identical path.
    expect(uriToPath(pathToUri(path))).toBe(path);
  });
});

describe("hoverToMarkdown", () => {
  it("passes plain strings through", () => {
    expect(hoverToMarkdown("docs")).toBe("docs");
  });

  it("renders MarkedString objects as fenced code", () => {
    expect(hoverToMarkdown({ language: "rust", value: "fn x()" })).toBe(
      "```rust\nfn x()\n```",
    );
  });

  it("joins arrays of mixed entries with blank lines", () => {
    expect(
      hoverToMarkdown(["intro", { language: "ts", value: "let a;" }]),
    ).toBe("intro\n\n```ts\nlet a;\n```");
  });

  it("unwraps MarkupContent", () => {
    expect(hoverToMarkdown({ kind: "markdown", value: "# h" })).toBe("# h");
  });
});

describe("lspSeverityToCm", () => {
  it("maps Error/Warning and defaults the rest to info", () => {
    expect(lspSeverityToCm(1)).toBe("error");
    expect(lspSeverityToCm(2)).toBe("warning");
    expect(lspSeverityToCm(3)).toBe("info");
    expect(lspSeverityToCm(4)).toBe("info");
    expect(lspSeverityToCm(undefined)).toBe("info");
  });
});
