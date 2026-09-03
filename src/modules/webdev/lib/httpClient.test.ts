// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { describe, expect, it } from "vitest";
import {
  contentTypeOf,
  formatElapsed,
  formatResponseBody,
  formatSize,
  isJsonContentType,
  missingVars,
  normalizeUrl,
  parseHeaders,
  statusClass,
  substituteVars,
} from "./httpClient";

describe("variable substitution", () => {
  const env = { baseUrl: "http://localhost:3000", token: "abc" };

  it("substitutes known variables anywhere in the text", () => {
    expect(substituteVars("{{baseUrl}}/users", env)).toBe(
      "http://localhost:3000/users",
    );
    expect(substituteVars("Bearer {{token}}", env)).toBe("Bearer abc");
  });

  it("tolerates whitespace inside the markers", () => {
    expect(substituteVars("{{ baseUrl }}/x", env)).toBe(
      "http://localhost:3000/x",
    );
  });

  it("leaves an unknown variable verbatim rather than emptying it", () => {
    // Emptying it produces `https:///users` or `Authorization: Bearer `, and
    // the resulting 401 sends you looking at the server instead of at this.
    expect(substituteVars("{{nope}}/users", env)).toBe("{{nope}}/users");
  });

  it("reports which variables are missing", () => {
    expect(missingVars("{{baseUrl}}/{{id}}?k={{key}}", env).sort()).toEqual([
      "id",
      "key",
    ]);
    expect(missingVars("{{baseUrl}}", env)).toEqual([]);
  });

  it("does not report a missing variable twice", () => {
    expect(missingVars("{{a}}/{{a}}", {})).toEqual(["a"]);
  });

  it("substitutes a variable whose value is an empty string", () => {
    // Defined-but-empty is a deliberate choice and must not read as missing.
    expect(substituteVars("x{{e}}y", { e: "" })).toBe("xy");
    expect(missingVars("{{e}}", { e: "" })).toEqual([]);
  });

  it("is not confused by inherited object properties", () => {
    // `{{toString}}` must not resolve to Object.prototype.toString.
    expect(substituteVars("{{toString}}", {})).toBe("{{toString}}");
    expect(missingVars("{{toString}}", {})).toEqual(["toString"]);
  });
});

describe("header parsing", () => {
  it("parses Name: value lines", () => {
    const { headers, invalid } = parseHeaders(
      "Content-Type: application/json\nAuthorization: Bearer x",
    );
    expect(headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer x",
    });
    expect(invalid).toEqual([]);
  });

  it("skips blanks and # comments so a header can be toggled off", () => {
    const { headers } = parseHeaders("\n# Authorization: Bearer x\nA: 1\n\n");
    expect(headers).toEqual({ A: "1" });
  });

  it("keeps colons inside the value", () => {
    const { headers } = parseHeaders("X-Url: http://example.com:8080/a");
    expect(headers["X-Url"]).toBe("http://example.com:8080/a");
  });

  it("preserves an empty value", () => {
    expect(parseHeaders("X-Empty:").headers).toEqual({ "X-Empty": "" });
  });

  it("reports a line with no colon rather than dropping it", () => {
    // A typo that silently removes an Authorization header is a long
    // debugging session.
    const { headers, invalid } = parseHeaders("Authorization Bearer x\nA: 1");
    expect(invalid).toEqual(["Authorization Bearer x"]);
    expect(headers).toEqual({ A: "1" });
  });

  it("reports a line that starts with a colon", () => {
    expect(parseHeaders(": value").invalid).toEqual([": value"]);
  });
});

describe("status classification", () => {
  it("bands the codes", () => {
    expect(statusClass(100)).toBe("info");
    expect(statusClass(200)).toBe("success");
    expect(statusClass(204)).toBe("success");
    expect(statusClass(301)).toBe("redirect");
    expect(statusClass(404)).toBe("client-error");
    expect(statusClass(500)).toBe("server-error");
    expect(statusClass(503)).toBe("server-error");
  });
});

describe("content type handling", () => {
  it("strips parameters and lowercases", () => {
    expect(contentTypeOf({ "content-type": "Application/JSON; charset=utf-8" })).toBe(
      "application/json",
    );
  });

  it("finds the header whatever its casing", () => {
    expect(contentTypeOf({ "Content-Type": "text/plain" })).toBe("text/plain");
  });

  it("returns empty when absent", () => {
    expect(contentTypeOf({})).toBe("");
  });

  it("recognises +json suffixes", () => {
    // application/problem+json is exactly the response worth pretty-printing.
    expect(isJsonContentType("application/json")).toBe(true);
    expect(isJsonContentType("application/problem+json")).toBe(true);
    expect(isJsonContentType("application/vnd.api+json")).toBe(true);
    expect(isJsonContentType("text/plain")).toBe(false);
    expect(isJsonContentType("application/jsonish")).toBe(false);
  });
});

describe("response body formatting", () => {
  it("pretty-prints JSON", () => {
    const { text, pretty } = formatResponseBody('{"a":1}', "application/json");
    expect(pretty).toBe(true);
    expect(text).toContain("\n");
  });

  it("shows an unparseable JSON body exactly as it came back", () => {
    // A truncated body or an HTML error page served with a JSON content type
    // is the evidence you need; replacing it with a parse error destroys it.
    const broken = '{"a":1';
    const { text, pretty } = formatResponseBody(broken, "application/json");
    expect(pretty).toBe(false);
    expect(text).toBe(broken);
  });

  it("leaves non-JSON alone", () => {
    expect(formatResponseBody("<html>", "text/html")).toEqual({
      text: "<html>",
      pretty: false,
    });
  });

  it("leaves an empty body alone", () => {
    expect(formatResponseBody("", "application/json").text).toBe("");
  });
});

describe("URL normalization", () => {
  it("adds http:// to a bare host", () => {
    // `localhost:3000` parses as the scheme `localhost` with path `3000`,
    // which is valid and never what was meant.
    expect(normalizeUrl("localhost:3000/api")).toBe("http://localhost:3000/api");
    expect(normalizeUrl("example.com")).toBe("http://example.com");
  });

  it("leaves an explicit scheme alone", () => {
    expect(normalizeUrl("https://example.com")).toBe("https://example.com");
    expect(normalizeUrl("HTTP://example.com")).toBe("HTTP://example.com");
  });

  it("leaves a leading variable alone, since it supplies the scheme", () => {
    expect(normalizeUrl("{{baseUrl}}/users")).toBe("{{baseUrl}}/users");
  });

  it("returns empty for empty input", () => {
    expect(normalizeUrl("   ")).toBe("");
  });
});

describe("size and time formatting", () => {
  it("reads like a file listing", () => {
    expect(formatSize(0)).toBe("0 B");
    expect(formatSize(999)).toBe("999 B");
    expect(formatSize(2048)).toBe("2.0 KB");
    expect(formatSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("switches to seconds past a second", () => {
    expect(formatElapsed(250)).toBe("250 ms");
    expect(formatElapsed(1500)).toBe("1.50 s");
  });
});
