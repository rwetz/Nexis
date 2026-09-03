// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The REST client's pure half: variable substitution, header parsing, and
 * response presentation. Kept out of the panel so each piece is testable
 * without a request, and out of Rust because none of it is a security
 * boundary — the guards that matter live in `net.rs` behind `http_send`.
 */

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export const HTTP_METHODS: readonly HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

export type SavedRequest = {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  /** Raw `Name: value` lines, as typed. */
  headers: string;
  body: string;
};

export type Environment = {
  name: string;
  /** Variable name → value. Referenced as `{{name}}`. */
  values: Record<string, string>;
};

// ── Variable substitution ───────────────────────────────────────────────────

const VAR_RE = /\{\{\s*([\w.-]+)\s*\}\}/g;

/**
 * Substitute `{{name}}` from the environment.
 *
 * An unknown variable is left **verbatim** rather than replaced with an empty
 * string. Silently emptying it produces a request to `https:///users` or a
 * header reading `Authorization: Bearer `, and the resulting 401 sends you
 * looking at the server. Leaving the marker in place makes the cause visible
 * in the URL bar, and `missingVars` lets the panel say so before you send.
 */
export function substituteVars(
  input: string,
  values: Record<string, string>,
): string {
  return input.replace(VAR_RE, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name] : match,
  );
}

/** Variable names referenced by the text that the environment does not define. */
export function missingVars(
  input: string,
  values: Record<string, string>,
): string[] {
  const missing = new Set<string>();
  for (const m of input.matchAll(VAR_RE)) {
    const name = m[1];
    if (!Object.prototype.hasOwnProperty.call(values, name)) missing.add(name);
  }
  return [...missing];
}

// ── Headers ─────────────────────────────────────────────────────────────────

/**
 * Parse `Name: value` lines into a map.
 *
 * Blank lines and `#` comments are skipped so a header can be commented out
 * rather than deleted, which is the normal way people toggle one. A line with
 * no colon is reported rather than dropped: a typo that silently removes an
 * `Authorization` header is a long debugging session.
 */
export function parseHeaders(text: string): {
  headers: Record<string, string>;
  invalid: string[];
} {
  const headers: Record<string, string> = {};
  const invalid: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx <= 0) {
      invalid.push(line);
      continue;
    }
    const name = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!name) {
      invalid.push(line);
      continue;
    }
    headers[name] = value;
  }
  return { headers, invalid };
}

// ── Response presentation ───────────────────────────────────────────────────

/** Broad class of a status code, for colouring and for reading at a glance. */
export function statusClass(
  status: number,
): "success" | "redirect" | "client-error" | "server-error" | "info" {
  if (status >= 500) return "server-error";
  if (status >= 400) return "client-error";
  if (status >= 300) return "redirect";
  if (status >= 200) return "success";
  return "info";
}

/** Content type without parameters, lowercased. */
export function contentTypeOf(headers: Record<string, string>): string {
  const raw =
    headers["content-type"] ?? headers["Content-Type"] ?? headers["CONTENT-TYPE"] ?? "";
  return raw.split(";")[0].trim().toLowerCase();
}

export function isJsonContentType(type: string): boolean {
  // `application/problem+json`, `application/vnd.api+json` and friends are
  // JSON and are exactly the responses worth pretty-printing.
  return type === "application/json" || type.endsWith("+json");
}

/**
 * Render a response body for display.
 *
 * JSON is pretty-printed, but only if it actually parses: a truncated or
 * error-page body served with a JSON content type must still be shown as it
 * came back rather than replaced by a parse error, because the raw text is
 * the evidence you need.
 */
export function formatResponseBody(
  body: string,
  contentType: string,
): { text: string; pretty: boolean } {
  if (isJsonContentType(contentType) && body.trim()) {
    try {
      return { text: JSON.stringify(JSON.parse(body), null, 2), pretty: true };
    } catch {
      return { text: body, pretty: false };
    }
  }
  return { text: body, pretty: false };
}

/** Bytes rendered the way a file listing would show them. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Elapsed time, at the precision a REST client is actually asked for. */
export function formatElapsed(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}

/**
 * Fill in a scheme when the URL bar was given a bare host.
 *
 * `localhost:3000` parses as the scheme `localhost` with the path `3000`,
 * which is both valid and never what was meant. Bare hosts get `http://`
 * rather than `https://`, because in this panel they are overwhelmingly a
 * local dev server that is not serving TLS.
 */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // A leading marker means the variable supplies the scheme; leave it alone.
  if (trimmed.startsWith("{{")) return trimmed;
  return `http://${trimmed}`;
}
