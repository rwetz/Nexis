// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Surgical TOML value editing for the hyperparameter form.
 *
 * We deliberately do NOT parse + re-serialize the whole file: train.toml
 * is the user's file, full of helpful comments and alignment, and a
 * round-trip through a generic serializer would flatten all of that.
 * Instead `tomlSet` replaces just the value of a `key = …` line within
 * its `[section]`, preserving everything else (comments, blank lines,
 * the user's other keys) byte-for-byte. This handles the simple subset
 * our templates use (sections + scalar / quoted-string / int-array
 * values) — not arbitrary TOML.
 */

const SECTION_RE = /^\s*\[([^\]]+)\]\s*(?:#.*)?$/;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectNewline(text: string): string {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

/**
 * Split the text after `=` into its value and any trailing `# comment`,
 * ignoring `#` inside quotes or brackets so `[1, 2] # note` and
 * `"a#b"` are handled correctly.
 */
function splitValueComment(rest: string): { value: string; comment: string } {
  let inString = false;
  let depth = 0;
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i];
    if (c === '"') inString = !inString;
    else if (!inString && c === "[") depth++;
    else if (!inString && c === "]") depth = Math.max(0, depth - 1);
    else if (!inString && depth === 0 && c === "#") {
      return { value: rest.slice(0, i).trim(), comment: rest.slice(i) };
    }
  }
  return { value: rest.trim(), comment: "" };
}

/** Read a key's raw value (e.g. `"15"`, `"0.01"`, `"[32, 16]"`,
 *  `'"auto"'`) from a section, or null if the key isn't present. */
export function tomlGet(text: string, section: string, key: string): string | null {
  const keyRe = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*(.*)$`);
  let current = "";
  for (const line of text.split(/\r?\n/)) {
    const sm = line.match(SECTION_RE);
    if (sm) {
      current = sm[1].trim();
      continue;
    }
    if (current !== section) continue;
    const km = line.match(keyRe);
    if (km) return splitValueComment(km[1]).value;
  }
  return null;
}

/**
 * Replace a key's value within its section, preserving the line's
 * indentation and trailing comment. Returns the text unchanged if the
 * key isn't found (the form only edits keys it first read).
 */
export function tomlSet(
  text: string,
  section: string,
  key: string,
  rawValue: string,
): string {
  const nl = detectNewline(text);
  const lines = text.split(/\r?\n/);
  const keyRe = new RegExp(`^(\\s*${escapeRegExp(key)}\\s*=\\s*)(.*)$`);
  let current = "";
  for (let i = 0; i < lines.length; i++) {
    const sm = lines[i].match(SECTION_RE);
    if (sm) {
      current = sm[1].trim();
      continue;
    }
    if (current !== section) continue;
    const km = lines[i].match(keyRe);
    if (km) {
      const { comment } = splitValueComment(km[2]);
      lines[i] = `${km[1]}${rawValue}${comment ? `  ${comment}` : ""}`;
      return lines.join(nl);
    }
  }
  return text;
}
