// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * SshKeyManager — lists ~/.ssh/*.pub keys, lets the user generate new Ed25519
 * key pairs via ssh-keygen, and copies public keys to the clipboard.
 *
 * All operations run through the existing shell_run_command IPC so no new
 * Rust code is required.
 */
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { IS_WINDOWS } from "@/lib/platform";
import { useCallback, useEffect, useState } from "react";

type CommandOutput = {
  stdout: string;
  stderr: string;
  exit_code: number | null;
  timed_out: boolean;
  truncated: boolean;
};

type SshKey = {
  filename: string;   // e.g. id_ed25519.pub
  label: string;      // derived from filename (strip .pub)
  publicKey: string;  // full public key line
  comment: string;    // last field of key line
};

async function runCmd(command: string): Promise<CommandOutput> {
  return invoke<CommandOutput>("shell_run_command", { command, cwd: null, timeoutSecs: 15 });
}

async function listKeys(os: string): Promise<SshKey[]> {
  const sshDir = os === "windows" ? "%USERPROFILE%\\.ssh" : "~/.ssh";
  const listCmd =
    os === "windows"
      ? `if exist "${sshDir}" dir /b "${sshDir}\\*.pub" 2>nul`
      : `ls "${sshDir}/"*.pub 2>/dev/null`;

  const out = await runCmd(listCmd);
  const filenames = out.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.endsWith(".pub") || l.includes(".pub"));

  // One shell round trip per key, run together rather than end to end — they
  // are independent reads, and Promise.all keeps the listing order.
  const read = await Promise.all(
    filenames.map(async (filename): Promise<SshKey | null> => {
      const base = filename.split(/[/\\]/).pop() ?? filename;
      const catCmd =
        os === "windows"
          ? `type "${sshDir}\\${base}"`
          : `cat "${sshDir}/${base}"`;
      try {
        const catOut = await runCmd(catCmd);
        const content = catOut.stdout.trim();
        const parts = content.split(/\s+/);
        const comment = parts.length >= 3 ? parts.slice(2).join(" ") : "";
        return {
          filename: base,
          label: base.replace(/\.pub$/, ""),
          publicKey: content,
          comment,
        };
      } catch {
        return null; // Skip unreadable key
      }
    }),
  );
  return read.filter((k): k is SshKey => k !== null);
}

export function SshKeyManager() {
  const [expanded, setExpanded] = useState(false);
  const [keys, setKeys] = useState<SshKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showGenForm, setShowGenForm] = useState(false);
  const [genLabel, setGenLabel] = useState("");
  const [genPassphrase, setGenPassphrase] = useState("");
  const [genError, setGenError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listKeys(IS_WINDOWS ? "windows" : "unix");
      setKeys(result);
    } catch {
      setKeys([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (expanded) void refresh();
  }, [expanded, refresh]);

  const handleGenerate = useCallback(async () => {
    const label = genLabel.trim() || "nexis_key";
    const sshDir = IS_WINDOWS ? "%USERPROFILE%\\.ssh" : "~/.ssh";
    const keyPath =
      IS_WINDOWS
        ? `${sshDir}\\${label}`
        : `${sshDir}/${label}`;
    const passFlag = genPassphrase ? `-N "${genPassphrase}"` : `-N ""`;
    const comment = label;
    const cmd = `ssh-keygen -t ed25519 -C "${comment}" -f "${keyPath}" ${passFlag}`;

    setGenerating(true);
    setGenError(null);
    try {
      const out = await runCmd(cmd);
      if (out.exit_code !== 0) {
        setGenError(out.stderr.trim() || "ssh-keygen failed");
      } else {
        setShowGenForm(false);
        setGenLabel("");
        setGenPassphrase("");
        await refresh();
      }
    } catch (e) {
      setGenError(String(e));
    } finally {
      setGenerating(false);
    }
  }, [genLabel, genPassphrase, refresh]);

  const handleCopy = useCallback(async (key: SshKey) => {
    await navigator.clipboard.writeText(key.publicKey);
    setCopiedKey(key.filename);
    setTimeout(() => setCopiedKey(null), 2000);
  }, []);

  return (
    <div className="border-t border-border/50">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left hover:bg-muted/20"
      >
        <Icon
          name={expanded ? "chevron-down" : "chevron-right"}
          className="shrink-0 text-muted-foreground"
        />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          SSH Keys
        </span>
        {keys.length > 0 && (
          <span className="ml-auto text-[10px] text-muted-foreground/60">
            {keys.length}
          </span>
        )}
      </button>

      {expanded && (
        <div className="pb-2">
          {/* Key list */}
          {loading ? (
            <div className="px-4 py-2 text-[11px] text-muted-foreground">
              Loading…
            </div>
          ) : keys.length === 0 ? (
            <div className="px-4 py-2 text-[11px] text-muted-foreground">
              No public keys found in ~/.ssh
            </div>
          ) : (
            <ul className="divide-y divide-border/20">
              {keys.map((k) => (
                <li
                  key={k.filename}
                  className="group flex items-center gap-2 px-3 py-1.5 hover:bg-muted/20"
                >
                  <Icon name="key" className="shrink-0 text-muted-foreground/60" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{k.label}</p>
                    {k.comment && k.comment !== k.label && (
                      <p className="truncate text-[10px] text-muted-foreground">
                        {k.comment}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    title="Copy public key"
                    onClick={() => void handleCopy(k)}
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                      copiedKey === k.filename && "text-green-500",
                    )}
                  >
                    <Icon
                      name={copiedKey === k.filename ? "check" : "copy"}
                      size="xs"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Generate form */}
          {showGenForm ? (
            <div className="mx-3 mt-2 rounded-md border border-border/50 bg-muted/20 p-2.5 space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground">
                New Ed25519 key
              </p>
              <div className="space-y-1.5">
                <Input
                  className="h-7 text-xs"
                  placeholder="Key name (e.g. my_server)"
                  value={genLabel}
                  onChange={(e) => setGenLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleGenerate();
                    if (e.key === "Escape") setShowGenForm(false);
                  }}
                  autoFocus
                />
                <Input
                  className="h-7 text-xs"
                  type="password"
                  placeholder="Passphrase (leave empty for none)"
                  value={genPassphrase}
                  onChange={(e) => setGenPassphrase(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleGenerate();
                    if (e.key === "Escape") setShowGenForm(false);
                  }}
                />
              </div>
              {genError && (
                <p className="text-[10px] text-destructive">{genError}</p>
              )}
              <div className="flex justify-end gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs"
                  onClick={() => { setShowGenForm(false); setGenError(null); }}
                  disabled={generating}
                >
                  <Icon name="close" size="xs" className="mr-1" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => void handleGenerate()}
                  disabled={generating}
                >
                  {generating ? "Generating…" : "Generate"}
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowGenForm(true)}
              className="mx-3 mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <Icon name="add" size="xs" />
              Generate new key
            </button>
          )}
        </div>
      )}
    </div>
  );
}
