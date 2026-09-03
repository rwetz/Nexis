// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import {
  decodeBase64,
  decodeJwt,
  decodeUrlComponent,
  encodeBase64,
  encodeUrlComponent,
  formatJson,
  minifyJson,
  queryJsonPath,
  runRegex,
} from "./scratchpad";

describe("JSON formatting", () => {
  it("formats and minifies round-trip", () => {
    const src = '{"b":1,"a":[1,2]}';
    const pretty = formatJson(src);
    expect(pretty.ok).toBe(true);
    if (pretty.ok) {
      expect(pretty.value).toContain("\n");
      const back = minifyJson(pretty.value);
      expect(back.ok && back.value).toBe(src);
    }
  });

  it("treats empty input as empty, not as an error", () => {
    // These run on every keystroke; an empty box is the normal starting state.
    expect(formatJson("")).toEqual({ ok: true, value: "" });
    expect(minifyJson("   ")).toEqual({ ok: true, value: "" });
  });

  it("reports a parse failure instead of throwing", () => {
    const r = formatJson("{oops");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeTruthy();
  });
});

describe("JSONPath subset", () => {
  const doc = JSON.stringify({
    store: {
      items: [
        { name: "a", price: 1 },
        { name: "b", price: 2 },
      ],
      "odd key": true,
    },
  });

  it("returns the whole document for $ or an empty path", () => {
    expect(queryJsonPath(doc, "$").ok).toBe(true);
    const all = queryJsonPath(doc, "");
    expect(all.ok && all.value).toContain("store");
  });

  it("walks dotted keys and array indices", () => {
    const r = queryJsonPath(doc, "$.store.items[0].name");
    expect(r.ok && r.value).toBe('"a"');
  });

  it("supports bracketed keys for names dots cannot express", () => {
    const r = queryJsonPath(doc, "$.store['odd key']");
    expect(r.ok && r.value).toBe("true");
    const dq = queryJsonPath(doc, '$.store["odd key"]');
    expect(dq.ok && dq.value).toBe("true");
  });

  it("collects a wildcard into a list", () => {
    const r = queryJsonPath(doc, "$.store.items[*].price");
    expect(r.ok && JSON.parse(r.value)).toEqual([1, 2]);
  });

  it("returns a single hit as the value, not as a one-item list", () => {
    const r = queryJsonPath(doc, "$.store.items[1].price");
    expect(r.ok && r.value).toBe("2");
  });

  it("returns empty for a path that matches nothing", () => {
    expect(queryJsonPath(doc, "$.store.missing")).toEqual({
      ok: true,
      value: "",
    });
    expect(queryJsonPath(doc, "$.store.items[9]")).toEqual({
      ok: true,
      value: "",
    });
  });

  it("rejects syntax outside the subset by name", () => {
    // Silently returning nothing would read as "the data did not match" when
    // the truth is "the tool did not understand".
    const r = queryJsonPath(doc, "$..name");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("unsupported path syntax");

    const filtered = queryJsonPath(doc, "$.store.items[?(@.price>1)]");
    expect(filtered.ok).toBe(false);
  });

  it("requires a leading $", () => {
    const r = queryJsonPath(doc, "store.items");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("must start with $");
  });

  it("does not index into an array with a key or vice versa", () => {
    expect(queryJsonPath(doc, "$.store.items.name")).toEqual({
      ok: true,
      value: "",
    });
    expect(queryJsonPath(doc, "$.store[0]")).toEqual({ ok: true, value: "" });
  });
});

describe("base64", () => {
  it("round-trips text beyond Latin-1", () => {
    // btoa alone throws on anything above U+00FF.
    const src = "héllo — 世界 🙂";
    const enc = encodeBase64(src);
    expect(enc.ok).toBe(true);
    if (enc.ok) {
      const dec = decodeBase64(enc.value);
      expect(dec.ok && dec.value).toBe(src);
    }
  });

  it("accepts the URL-safe alphabet and missing padding", () => {
    // Both are the normal shape of a token pasted out of a browser.
    const standard = encodeBase64("subject");
    expect(standard.ok).toBe(true);
    if (standard.ok) {
      const urlSafe = standard.value
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      const dec = decodeBase64(urlSafe);
      expect(dec.ok && dec.value).toBe("subject");
    }
  });

  it("treats empty input as empty", () => {
    expect(decodeBase64("  ")).toEqual({ ok: true, value: "" });
  });

  it("reports garbage instead of throwing", () => {
    expect(decodeBase64("!!!not base64!!!").ok).toBe(false);
  });
});

describe("URL encoding", () => {
  it("round-trips", () => {
    const src = "a b&c=d/é?";
    const enc = encodeUrlComponent(src);
    expect(enc.ok).toBe(true);
    if (enc.ok) expect(decodeUrlComponent(enc.value)).toEqual({ ok: true, value: src });
  });

  it("explains a stray percent rather than leaking a bare URIError", () => {
    const r = decodeUrlComponent("100%");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("stray %");
  });
});

describe("JWT decoding", () => {
  // Built here rather than pasted so the test carries no credential-shaped
  // literal; the signature is deliberately meaningless.
  function makeJwt(payload: Record<string, unknown>): string {
    const b64 = (o: unknown) =>
      (encodeBase64(JSON.stringify(o)) as { ok: true; value: string }).value
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.notasignature`;
  }

  it("decodes header and payload", () => {
    const r = decodeJwt(makeJwt({ sub: "123", name: "A" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.header).toContain("HS256");
      expect(r.value.payload).toContain('"sub"');
      expect(r.value.signature).toBe("notasignature");
    }
  });

  it("reads exp and iat as seconds, not milliseconds", () => {
    // Reading them as ms puts every token in 1970 and calls it long expired.
    const future = Math.floor(Date.now() / 1000) + 3600;
    const past = Math.floor(Date.now() / 1000) - 3600;

    const live = decodeJwt(makeJwt({ exp: future, iat: past }));
    expect(live.ok).toBe(true);
    if (live.ok) {
      expect(live.value.expiry?.expired).toBe(false);
      expect(live.value.issuedAt).toBeTruthy();
      // 1970 would mean the seconds/ms confusion is back.
      expect(live.value.expiry?.at).not.toContain("1970");
    }

    const dead = decodeJwt(makeJwt({ exp: past }));
    expect(dead.ok && dead.value.expiry?.expired).toBe(true);
  });

  it("leaves expiry null when there is no exp claim", () => {
    const r = decodeJwt(makeJwt({ sub: "1" }));
    expect(r.ok && r.value.expiry).toBeNull();
  });

  it("rejects a token without three parts", () => {
    const r = decodeJwt("only.two");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("three");
  });

  it("rejects a token whose payload is not JSON", () => {
    const enc = encodeBase64("not json") as { ok: true; value: string };
    const r = decodeJwt(`${enc.value}.${enc.value}.sig`);
    expect(r.ok).toBe(false);
  });
});

describe("regex tester", () => {
  it("returns every match with its position and groups", () => {
    const r = runRegex("(\\w)(\\d)", "", "a1 b2");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.matches).toHaveLength(2);
      expect(r.matches[0]).toMatchObject({ index: 0, text: "a1" });
      expect(r.matches[0].groups).toEqual(["a", "1"]);
      expect(r.matches[1].index).toBe(3);
    }
  });

  it("captures named groups", () => {
    const r = runRegex("(?<letter>[a-z])", "", "xy");
    expect(r.ok && r.matches[0].named).toEqual({ letter: "x" });
  });

  it("terminates on a zero-length match", () => {
    // `a*` matches empty at every position and lastIndex does not advance;
    // the obvious loop hangs the UI thread forever.
    const r = runRegex("a*", "", "bbb");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.matches.length).toBeLessThanOrEqual(4);
  });

  it("caps the match count", () => {
    const r = runRegex(".", "", "x".repeat(5000), 10);
    expect(r.ok && r.matches).toHaveLength(10);
  });

  it("adds the global flag rather than returning one match", () => {
    const r = runRegex("a", "i", "AaA");
    expect(r.ok && r.matches).toHaveLength(3);
  });

  it("reports an invalid pattern instead of throwing", () => {
    const r = runRegex("(unclosed", "", "x");
    expect(r.ok).toBe(false);
  });

  it("treats an empty pattern as no matches", () => {
    expect(runRegex("", "", "abc")).toEqual({ ok: true, matches: [] });
  });
});
