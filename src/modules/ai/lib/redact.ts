// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

const PATTERNS: Array<{ kind: string; re: RegExp }> = [
  { kind: "openai-key", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { kind: "anthropic-key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { kind: "aws-access-key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { kind: "github-token", re: /\bgh[opsur]_[A-Za-z0-9]{36,}\b/g },
  { kind: "github-pat", re: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g },
  { kind: "google-api-key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: "slack-token", re: /\bxox[bpsare]-[A-Za-z0-9-]{10,}\b/g },
  { kind: "stripe-key", re: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{24,}\b/g },
  { kind: "jwt", re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  { kind: "bearer", re: /\bBearer\s+[A-Za-z0-9._-]{20,}/g },
  {
    kind: "env-assign",
    re: /\b((?:[A-Z][A-Z0-9_]*)?(?:API[_-]?KEY|SECRET(?:[_-]?KEY)?|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|PASSWORD|PASSWD|PRIVATE[_-]?KEY|CLIENT[_-]?SECRET)[A-Z0-9_]*)\s*[:=]\s*(["']?)([^\s"';|&]+)\2/gi,
  },
];

/** One detector's name and where it matched. */
export type SecretFinding = {
  /** The detector that fired — `openai-key`, `env-assign`, and so on. */
  kind: string;
  /** 1-based line number within the text that was scanned. */
  line: number;
  /** The matched text, already redacted. Never the secret itself. */
  redacted: string;
  /** The whole line, redacted, for context in a list. */
  context: string;
};

/**
 * Report what `redactSensitive` *would* redact, rather than redacting it.
 *
 * Same pattern list, one definition — that is the whole reason this lives
 * here instead of in the panel that uses it. A second copy of a
 * security-critical regex set is how the two stop agreeing, which is the same
 * argument §3 of the command-ledger decision record makes for keeping
 * redaction on one side of the IPC boundary.
 *
 * Findings carry the **redacted** form of the match. A scanner that reports
 * "found `sk-ant-…real key…` on line 12" has copied the secret into a new
 * place — a UI list, a log, possibly a screenshot — which is the opposite of
 * what it is for. The line number is enough to go and look.
 */
export function findSecrets(text: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((raw, i) => {
    // Redact the line once, up front. Calling `redactSensitive` *inside* the
    // exec loop below hangs the process: it runs `String.replace` against the
    // very same /g regex being iterated, and a completed `replace` resets that
    // regex's `lastIndex` to 0 — so `exec` returns the first match forever and
    // the findings array grows until the worker dies.
    const context = redactSensitive(raw).trim().slice(0, 240);

    for (const { kind, re } of PATTERNS) {
      // The patterns are module-level and /g, so `lastIndex` is shared state
      // across every caller. Resetting per line keeps one line's match from
      // making the next line start mid-string.
      re.lastIndex = 0;
      const matched: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(raw)) !== null) {
        matched.push(m[0]);
        // A zero-length match would not advance `lastIndex` on its own.
        if (m[0] === "") re.lastIndex += 1;
      }
      for (const hit of matched) {
        findings.push({ kind, line: i + 1, redacted: redactSensitive(hit), context });
      }
    }
  });

  return findings;
}

export function redactSensitive(text: string): string {
  let out = text;
  for (const { kind, re } of PATTERNS) {
    if (kind === "env-assign") {
      out = out.replace(re, (_m, name, q, _val) => `${name}=${q}<REDACTED>${q}`);
    } else {
      out = out.replace(re, `<REDACTED:${kind}>`);
    }
  }
  return out;
}
