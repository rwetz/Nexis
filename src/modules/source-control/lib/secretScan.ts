// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Secret scanning over a staged diff.
 *
 * The detectors already existed — they are the same ones that guard terminal
 * recordings, the diagnostics bundle and the command ledger. All this adds is
 * pointing them at the change you are about to commit, which is the last
 * moment a secret is still cheap to remove. After a commit it is in the
 * reflog; after a push it is public and must be rotated.
 *
 * Two things this deliberately does **not** do:
 *
 * - **It does not block a commit.** A scanner that cannot be bypassed becomes
 *   a scanner that gets disabled, and then it protects nothing. It reports;
 *   the commit button still works.
 * - **It never carries the secret.** A finding holds the *redacted* match and
 *   a file and line number. Reporting the real value would copy it into a UI
 *   list, the render tree, and any screenshot of them — the opposite of the
 *   job.
 *
 * Only **added** lines are scanned. A secret already on the branch is not
 * something this commit is introducing, and flagging it on every unrelated
 * commit that touches the file is how a scanner trains you to ignore it.
 */

import { findSecrets } from "@/modules/ai/lib/redact";

/**
 * One flagged **line**, not one flagged detector.
 *
 * Several detectors legitimately fire on the same text — `apiKey: "sk-proj-…"`
 * is both an OpenAI key and a secret-looking assignment — and reporting it
 * twice would make the list look like two problems when there is one place to
 * go and edit. The kinds are collected onto the line instead.
 */
export type DiffSecretFinding = {
  /** Every detector that fired on this line. */
  kinds: string[];
  /** Repo-relative path of the file the added line is in. */
  file: string;
  /** Line number in the *new* file, so it matches what the editor shows. */
  fileLine: number;
  /** The line, redacted. Never the secret itself. */
  context: string;
  /** Stable key for the per-repo allowlist. Never contains the secret. */
  fingerprint: string;
};

/** `+++ b/path/to/file` — the destination path of the current file section. */
const NEW_FILE_RE = /^\+\+\+ (?:b\/)?(.+)$/;

/** `@@ -old,count +new,count @@` — the new-file line the hunk starts at. */
const HUNK_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * FNV-1a over the finding's identity.
 *
 * A hash rather than the text itself because the fingerprint is persisted in
 * the allowlist, and an allowlist that stores the secret it is allowing has
 * written the secret to disk in a second place. This is an identity key, not
 * a security boundary — the same reasoning, and the same hash, as the ledger's
 * workspace id.
 */
function fingerprintOf(kinds: string[], file: string, context: string): string {
  const input = `${kinds.join(",")}|${file}|${context}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `sec-${hash.toString(36)}`;
}

/**
 * Scan the added lines of a unified diff.
 *
 * Tolerant of a truncated diff — `git_diff` caps its output, and half a hunk
 * should still be scanned rather than throwing away every finding before it.
 */
export function scanDiffForSecrets(diff: string): DiffSecretFinding[] {
  const findings: DiffSecretFinding[] = [];
  let file = "";
  let newLine = 0;

  for (const raw of diff.split(/\r?\n/)) {
    const newFile = NEW_FILE_RE.exec(raw);
    if (newFile) {
      // `/dev/null` is a deletion; nothing is being added to a file that is
      // going away.
      file = newFile[1] === "/dev/null" ? "" : newFile[1];
      continue;
    }
    const hunk = HUNK_RE.exec(raw);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    // `+++` is handled above; a bare `+` is an added line. Context lines and
    // deletions advance (or don't advance) the new-file counter but are not
    // scanned.
    if (raw.startsWith("+") && !raw.startsWith("+++")) {
      const content = raw.slice(1);
      if (file !== "") {
        const hits = findSecrets(content);
        if (hits.length > 0) {
          // Collapse to one row per line, preserving detector order and
          // dropping duplicates of the same detector on the same line.
          const kinds = [...new Set(hits.map((h) => h.kind))];
          const context = hits[0].context;
          findings.push({
            kinds,
            file,
            fileLine: newLine,
            context,
            fingerprint: fingerprintOf(kinds, file, context),
          });
        }
      }
      newLine += 1;
      continue;
    }
    if (raw.startsWith("-") && !raw.startsWith("---")) continue;
    // Context, or the "\ No newline at end of file" marker.
    if (raw.startsWith(" ") || raw === "") newLine += 1;
  }

  return findings;
}

/** Human label for a detector, for a list row. */
export function describeKind(kind: string): string {
  const LABELS: Record<string, string> = {
    "openai-key": "OpenAI API key",
    "anthropic-key": "Anthropic API key",
    "aws-access-key": "AWS access key id",
    "github-token": "GitHub token",
    "github-pat": "GitHub personal access token",
    "google-api-key": "Google API key",
    "slack-token": "Slack token",
    "stripe-key": "Stripe key",
    jwt: "JSON Web Token",
    bearer: "Bearer token",
    "env-assign": "Secret-looking assignment",
  };
  return LABELS[kind] ?? kind;
}
