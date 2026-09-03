// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Source-level regression test for the preview iframes' security attributes.
 * Rendering this component for real requires jsdom + a working
 * useImperativeHandle stub; for a focused security check we verify the static
 * JSX still carries the sandbox/referrerPolicy attributes — if a future change
 * silently removes them, this test fails.
 *
 * The pane now renders **more than one** iframe: one full-size frame, plus one
 * per device viewport in the side-by-side mode. So the assertions moved from
 * "the iframe carries these attributes" to "there is exactly one sandbox
 * definition and every iframe uses it". A second frame that quietly declared
 * its own weaker sandbox is precisely the regression worth catching, and the
 * old single-`<iframe>` match could not have seen it.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, "PreviewPane.tsx"), "utf8");

/** Strip comments so assertions only see attribute syntax. */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const sandboxLiteral =
  src.match(/const PREVIEW_SANDBOX\s*=\s*\n?\s*"([^"]*)"/)?.[1] ?? "";

const iframes = [...src.matchAll(/<iframe[\s\S]*?\/>/g)].map((m) =>
  stripComments(m[0]),
);

describe("PreviewPane iframe sandbox", () => {
  it("declares iframes in the source", () => {
    expect(iframes.length).toBeGreaterThan(0);
  });

  it("defines the sandbox exactly once", () => {
    // One definition is what keeps the frames from drifting apart.
    expect(sandboxLiteral).not.toBe("");
    expect(src.match(/sandbox="/g)).toBeNull();
  });

  it("routes every iframe through that one definition", () => {
    for (const frame of iframes) {
      expect(frame).toMatch(/sandbox=\{PREVIEW_SANDBOX\}/);
    }
  });

  it("grants allow-scripts and allow-same-origin", () => {
    // These two are what makes a dev preview useful — strip either and dev
    // servers stop working.
    expect(sandboxLiteral).toContain("allow-scripts");
    expect(sandboxLiteral).toContain("allow-same-origin");
  });

  it("does NOT include allow-top-navigation* tokens", () => {
    // The whole point of sandboxing here: forbid the iframe from navigating
    // the parent Tauri webview to an attacker origin (which would expose
    // window.__TAURI__). Top-nav permissions must never be added.
    expect(sandboxLiteral).not.toMatch(/allow-top-navigation/);
  });

  it("does NOT include allow-popups-without-allow-popups-to-escape-sandbox combo", () => {
    // If popups are allowed, they MUST escape the sandbox cleanly — otherwise
    // a popup window inherits sandbox flags and we get hard-to-debug behavior.
    if (/allow-popups\b/.test(sandboxLiteral)) {
      expect(sandboxLiteral).toContain("allow-popups-to-escape-sandbox");
    }
  });

  it("sets referrerPolicy to no-referrer on every iframe", () => {
    for (const frame of iframes) {
      expect(frame).toMatch(/referrerPolicy="no-referrer"/);
    }
  });

  it("scales device frames with transform, never CSS zoom", () => {
    // Both shrink the box; only transform keeps hit-testing correct. A CSS
    // `zoom` here reproduces pitfall #15 inside the previewed page, where it
    // would be blamed on the user's own app rather than on Nexis.
    const scaled = iframes.filter((f) => /transform:/.test(f));
    expect(scaled.length).toBeGreaterThan(0);
    for (const frame of scaled) {
      expect(frame).toMatch(/transform:\s*`scale\(/);
      expect(frame).not.toMatch(/\bzoom\b/);
    }
  });
});
