// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * Secret scan over the staged diff, in the panel you are about to commit from.
 *
 * The detectors already guarded terminal recordings, the diagnostics bundle
 * and the command ledger; this points them at the change you are about to
 * make permanent, which is the last moment a secret is still cheap to remove.
 * After a commit it is in the reflog. After a push it is public and has to be
 * rotated.
 *
 * Three deliberate choices, each of which is the difference between a scanner
 * people keep and one they turn off:
 *
 * - **It never blocks the commit.** It reports; the commit button is
 *   untouched. A check you cannot bypass becomes a check you disable, and a
 *   disabled check protects nothing.
 * - **It expands itself when it finds something**, and stays collapsed and
 *   quiet when it does not. A section you have to remember to open is a
 *   section that is closed on the day it mattered.
 * - **Every finding can be dismissed for this repo.** Without that, one false
 *   positive on a fixture file is a standing reason to ignore the whole
 *   section. The allowlist stores a hash, never the matched text.
 */

import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { native } from "@/modules/ai/lib/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  describeKind,
  scanDiffForSecrets,
  type DiffSecretFinding,
} from "./lib/secretScan";

type Props = {
  repoRoot: string;
  /**
   * Identity of the staged set. Changes when a file is staged or unstaged,
   * which is exactly when the answer can change — a string rather than a
   * counter so the panel does not have to keep a revision of its own.
   */
  stagedKey: string;
  /** Show the flagged file's staged diff. */
  onOpenFile?: (path: string) => void;
};

/**
 * Allowlisted fingerprints, per repo, in localStorage.
 *
 * Per repo rather than global because a fixture that is fine in one project is
 * not evidence about another, and per repo rather than in a committed file
 * because dismissing a false positive should not itself be a commit. Read
 * defensively: a private window or cleared site data must degrade to "nothing
 * dismissed", not to a crash.
 */
function allowKey(repoRoot: string): string {
  return `nexis:secret-scan:allow:${repoRoot.replace(/\\/g, "/").toLowerCase()}`;
}

function readAllowlist(repoRoot: string): Set<string> {
  try {
    const raw = localStorage.getItem(allowKey(repoRoot));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function writeAllowlist(repoRoot: string, ids: Set<string>): void {
  try {
    localStorage.setItem(allowKey(repoRoot), JSON.stringify([...ids]));
  } catch {
    // Storage unavailable: the dismissal holds for this session only, which is
    // better than failing the click.
  }
}

export function SecretScanSection({ repoRoot, stagedKey, onOpenFile }: Props) {
  const [findings, setFindings] = useState<DiffSecretFinding[]>([]);
  const [allowed, setAllowed] = useState<Set<string>>(() => readAllowlist(repoRoot));
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    setAllowed(readAllowlist(repoRoot));
  }, [repoRoot]);

  const scan = useCallback(async () => {
    if (!repoRoot) return;
    setLoading(true);
    try {
      const diff = await native.gitDiff(repoRoot, null, true);
      setFindings(scanDiffForSecrets(diff.diffText));
      setTruncated(diff.truncated);
      setError(null);
    } catch (e) {
      // A scan that fails silently is worse than no scan: it looks exactly
      // like a clean result.
      setFindings([]);
      setError(typeof e === "string" ? e : "Could not read the staged diff");
    } finally {
      setLoading(false);
    }
  }, [repoRoot]);

  // Rescan whenever the staged set changes. Staging is when a line becomes
  // part of the next commit, so it is the moment the answer can change.
  useEffect(() => {
    void scan();
  }, [scan, stagedKey]);

  const live = useMemo(
    () => findings.filter((f) => !allowed.has(f.fingerprint)),
    [findings, allowed],
  );

  // Open on a finding. Deliberately one-way: it opens itself when something
  // appears, and does not slam shut on the next keystroke while you are
  // reading it.
  useEffect(() => {
    if (live.length > 0) setExpanded(true);
  }, [live.length]);

  const dismiss = (fingerprint: string) => {
    const next = new Set(allowed);
    next.add(fingerprint);
    setAllowed(next);
    writeAllowlist(repoRoot, next);
  };

  const restoreAll = () => {
    setAllowed(new Set());
    writeAllowlist(repoRoot, new Set());
  };

  // Nothing found and nothing dismissed: stay out of the way entirely. The
  // panel is long enough already, and a permanent "0 secrets" row is noise.
  if (!loading && !error && live.length === 0 && allowed.size === 0) return null;

  return (
    <div className="border-t border-border/40">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex h-7 w-full items-center gap-2 px-3 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground"
      >
        <Icon
          name="chevron-down"
          size="xs"
          className={cn(
            "shrink-0 transition-transform",
            expanded ? "rotate-0" : "-rotate-90",
          )}
        />
        <Icon
          name="security"
          className={cn("shrink-0", live.length > 0 && "text-destructive")}
        />
        <span>Secret scan</span>
        {loading ? (
          <Spinner className="ml-auto size-2.5" />
        ) : live.length > 0 ? (
          <span className="ml-auto rounded-sm bg-destructive/15 px-1 py-px text-[9.5px] tabular-nums text-destructive">
            {live.length}
          </span>
        ) : (
          <span className="ml-auto text-[9.5px] text-muted-foreground/60">
            clear
          </span>
        )}
      </button>

      {expanded && (
        <div className="space-y-1.5 px-2 pt-1 pb-2">
          {error ? (
            <p className="px-1 text-[10.5px] text-destructive">{error}</p>
          ) : live.length === 0 ? (
            <p className="px-1 text-[10.5px] leading-relaxed text-muted-foreground">
              Nothing flagged in the staged changes.
              {allowed.size > 0
                ? ` ${allowed.size} finding${allowed.size === 1 ? " is" : "s are"} dismissed in this repo.`
                : ""}
            </p>
          ) : (
            <>
              <p className="px-1 text-[10.5px] leading-relaxed text-muted-foreground">
                Found in lines this commit <em>adds</em>. Committing is not
                blocked — but after a push these have to be rotated, not
                deleted.
              </p>
              {live.map((f) => (
                <div
                  key={f.fingerprint}
                  className="group rounded-md border border-destructive/25 bg-destructive/[0.06] px-2 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
                      {f.kinds.map(describeKind).join(" + ")}
                    </span>
                    <button
                      type="button"
                      onClick={() => dismiss(f.fingerprint)}
                      title="Not a secret — ignore this in this repo"
                      className="shrink-0 rounded px-1 py-px text-[9.5px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted/60 hover:text-foreground focus-visible:opacity-100"
                    >
                      Ignore
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenFile?.(f.file)}
                    disabled={!onOpenFile}
                    className="mt-0.5 block w-full truncate text-left font-mono text-[10px] text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground"
                  >
                    {f.file}:{f.fileLine}
                  </button>
                  {/* Redacted, always. Printing the match here would put the
                      secret into the render tree and any screenshot of it. */}
                  <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/70">
                    {f.context}
                  </p>
                </div>
              ))}
            </>
          )}

          {truncated ? (
            <p className="px-1 text-[10px] text-muted-foreground/70">
              The staged diff was too large to read in full, so this scan is
              partial.
            </p>
          ) : null}

          <div className="flex items-center gap-1 px-1 pt-0.5">
            <Button
              size="xs"
              variant="ghost"
              className="h-6 cursor-pointer gap-1.5 text-[10.5px]"
              onClick={() => void scan()}
              disabled={loading}
            >
              <Icon name="refresh" size="xs" />
              Rescan
            </Button>
            {allowed.size > 0 ? (
              <Button
                size="xs"
                variant="ghost"
                className="h-6 cursor-pointer text-[10.5px] text-muted-foreground"
                onClick={restoreAll}
              >
                Un-ignore {allowed.size}
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
