// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The small conversions you leave an editor for, done in the editor.
 *
 * Every function here is pure and total: it returns a discriminated result
 * rather than throwing, because all of these run on *every keystroke* against
 * text that is half-typed by definition. An exception on the third character
 * of a JSON document is not an error condition, it is the normal state of the
 * input, and a panel that has to try/catch each call is a panel that will
 * eventually forget to.
 *
 * Nothing here reaches the network, and none of it is a security boundary —
 * the JWT decoder in particular **does not verify signatures** and says so at
 * the call site, because a decoder that looks like a verifier is worse than no
 * decoder at all.
 */

export type ToolResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

const ok = (value: string): ToolResult => ({ ok: true, value });
const err = (error: string): ToolResult => ({ ok: false, error });

/** Message from a thrown value, without assuming it is an Error. */
function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ── JSON ────────────────────────────────────────────────────────────────────

export function formatJson(input: string, indent = 2): ToolResult {
  if (!input.trim()) return ok("");
  try {
    return ok(JSON.stringify(JSON.parse(input), null, indent));
  } catch (e) {
    return err(messageOf(e));
  }
}

export function minifyJson(input: string): ToolResult {
  if (!input.trim()) return ok("");
  try {
    return ok(JSON.stringify(JSON.parse(input)));
  } catch (e) {
    return err(messageOf(e));
  }
}

/**
 * A deliberately small JSONPath subset: `$`, `.key`, `['key']`, `[0]`, and
 * `[*]`. No recursive descent, no filters, no slices.
 *
 * The subset is the point. The full grammar wants a parser and an evaluator
 * with their own bug surface, and the queries people actually type into a
 * scratchpad to find a value in a response are these. A query using anything
 * outside the subset is rejected by name rather than silently returning
 * nothing, so it is obvious that the tool did not understand rather than that
 * the data did not match.
 */
export function queryJsonPath(input: string, path: string): ToolResult {
  if (!input.trim()) return ok("");
  let data: unknown;
  try {
    data = JSON.parse(input);
  } catch (e) {
    return err(messageOf(e));
  }

  const trimmed = path.trim();
  if (!trimmed || trimmed === "$") return ok(JSON.stringify(data, null, 2));
  if (!trimmed.startsWith("$")) return err("a path must start with $");

  // Tokenize into keys, indices and wildcards.
  const tokens: (string | number | "*")[] = [];
  const rest = trimmed.slice(1);
  const re = /\.([A-Za-z_$][\w$]*)|\[\s*(\d+)\s*\]|\[\s*\*\s*\]|\[\s*'([^']*)'\s*\]|\[\s*"([^"]*)"\s*\]|\.\*/g;
  let consumed = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rest)) !== null) {
    if (m.index !== consumed) break;
    consumed = m.index + m[0].length;
    if (m[1] !== undefined) tokens.push(m[1]);
    else if (m[2] !== undefined) tokens.push(Number(m[2]));
    else if (m[3] !== undefined) tokens.push(m[3]);
    else if (m[4] !== undefined) tokens.push(m[4]);
    else tokens.push("*");
  }
  if (consumed !== rest.length) {
    return err(
      `unsupported path syntax at "${rest.slice(consumed) || rest}" — this ` +
        `subset understands $, .key, ['key'], [0] and [*]`,
    );
  }

  let current: unknown[] = [data];
  for (const token of tokens) {
    const next: unknown[] = [];
    for (const node of current) {
      if (node == null) continue;
      if (token === "*") {
        if (Array.isArray(node)) next.push(...node);
        else if (typeof node === "object") {
          next.push(...Object.values(node as Record<string, unknown>));
        }
      } else if (typeof token === "number") {
        if (Array.isArray(node) && token < node.length) next.push(node[token]);
      } else if (typeof node === "object" && !Array.isArray(node)) {
        const rec = node as Record<string, unknown>;
        if (token in rec) next.push(rec[token]);
      }
    }
    current = next;
  }

  if (current.length === 0) return ok("");
  // A single hit is returned as the value; several are returned as a list, so
  // `$.a` and `$.items[*]` do not read the same when they mean different
  // things.
  const result = current.length === 1 ? current[0] : current;
  return ok(JSON.stringify(result, null, 2));
}

// ── Base64 / URL ────────────────────────────────────────────────────────────

/** UTF-8 safe: `btoa` alone throws on any character above U+00FF. */
export function encodeBase64(input: string): ToolResult {
  try {
    const bytes = new TextEncoder().encode(input);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return ok(btoa(binary));
  } catch (e) {
    return err(messageOf(e));
  }
}

export function decodeBase64(input: string): ToolResult {
  const trimmed = input.trim();
  if (!trimmed) return ok("");
  try {
    // Accept the URL-safe alphabet and missing padding: both turn up
    // constantly in tokens pasted out of a browser.
    const normalized = trimmed.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return ok(new TextDecoder().decode(bytes));
  } catch (e) {
    return err(messageOf(e));
  }
}

export function encodeUrlComponent(input: string): ToolResult {
  try {
    return ok(encodeURIComponent(input));
  } catch (e) {
    return err(messageOf(e));
  }
}

export function decodeUrlComponent(input: string): ToolResult {
  try {
    return ok(decodeURIComponent(input));
  } catch (e) {
    // A lone "%" is the common case and URIError's own text does not say so.
    return err(`${messageOf(e)} — check for a stray % or an incomplete escape`);
  }
}

// ── JWT ─────────────────────────────────────────────────────────────────────

export type JwtParts = {
  header: string;
  payload: string;
  /** Present but never checked — see `decodeJwt`. */
  signature: string;
  /** `exp` rendered as a local time plus whether it has passed, if present. */
  expiry: { at: string; expired: boolean } | null;
  issuedAt: string | null;
};

/**
 * Split and decode a JWT.
 *
 * **This does not verify the signature and cannot.** Verification needs the
 * issuer's key and the algorithm the issuer actually intends — and a tool that
 * displays a decoded payload next to a green tick is how `alg: none` bugs get
 * shipped. The panel labels the output as decoded, not verified.
 */
export function decodeJwt(token: string): { ok: true; value: JwtParts } | { ok: false; error: string } {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, error: "no token" };
  const parts = trimmed.split(".");
  if (parts.length !== 3) {
    return {
      ok: false,
      error: `a JWT has three dot-separated parts; this has ${parts.length}`,
    };
  }

  const header = decodeBase64(parts[0]);
  const payload = decodeBase64(parts[1]);
  if (!header.ok) return { ok: false, error: `header: ${header.error}` };
  if (!payload.ok) return { ok: false, error: `payload: ${payload.error}` };

  const prettyHeader = formatJson(header.value);
  const prettyPayload = formatJson(payload.value);
  if (!prettyHeader.ok) return { ok: false, error: `header is not JSON` };
  if (!prettyPayload.ok) return { ok: false, error: `payload is not JSON` };

  let expiry: JwtParts["expiry"] = null;
  let issuedAt: string | null = null;
  try {
    const claims = JSON.parse(payload.value) as Record<string, unknown>;
    // JWT times are seconds since the epoch, not milliseconds -- reading them
    // as ms puts every token in 1970 and reports it as long expired.
    if (typeof claims.exp === "number") {
      const at = new Date(claims.exp * 1000);
      expiry = { at: at.toLocaleString(), expired: at.getTime() < Date.now() };
    }
    if (typeof claims.iat === "number") {
      issuedAt = new Date(claims.iat * 1000).toLocaleString();
    }
  } catch {
    // The payload parsed above; a claim shape we did not expect is not fatal.
  }

  return {
    ok: true,
    value: {
      header: prettyHeader.value,
      payload: prettyPayload.value,
      signature: parts[2],
      expiry,
      issuedAt,
    },
  };
}

// ── Regex ───────────────────────────────────────────────────────────────────

export type RegexMatch = {
  index: number;
  text: string;
  groups: string[];
  named: Record<string, string>;
};

export type RegexResult =
  | { ok: true; matches: RegexMatch[] }
  | { ok: false; error: string };

/**
 * Run a pattern over a subject, always globally.
 *
 * The zero-length-match guard is the load-bearing detail: a pattern like `a*`
 * matches the empty string at every position, and `lastIndex` does not advance
 * on a zero-length match, so the obvious loop never terminates. This runs in
 * the UI thread on every keystroke, so "never terminates" means the window
 * stops responding.
 */
export function runRegex(
  pattern: string,
  flags: string,
  subject: string,
  limit = 500,
): RegexResult {
  if (!pattern) return { ok: true, matches: [] };
  let re: RegExp;
  try {
    re = new RegExp(pattern, flags.includes("g") ? flags : `${flags}g`);
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }

  const matches: RegexMatch[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(subject)) !== null) {
    matches.push({
      index: m.index,
      text: m[0],
      groups: m.slice(1).map((g) => g ?? ""),
      named: { ...(m.groups ?? {}) } as Record<string, string>,
    });
    if (m[0] === "") re.lastIndex += 1;
    if (matches.length >= limit) break;
  }
  return { ok: true, matches };
}
