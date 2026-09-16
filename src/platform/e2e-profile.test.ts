import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("desktop verification profile", () => {
  it("seeds only the separately identified E2E application", () => {
    const shipping = JSON.parse(
      readFileSync("src-tauri/tauri.conf.json", "utf8"),
    );
    const testing = JSON.parse(
      readFileSync("src-tauri/tauri.e2e.conf.json", "utf8"),
    );
    const harness = readFileSync("e2e/wdio.conf.ts", "utf8");
    expect(testing.identifier).toBe(`${shipping.identifier}.e2e`);
    expect(harness).toContain(`const APP_IDENTIFIER = "${testing.identifier}"`);
  });
});
