// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * ShellSnippetsPanel — save and run frequently-used shell commands.
 *
 * Snippets are stored in localStorage under "nexis:shell-snippets".
 * Clicking a snippet sends it to the active terminal via `sendToTerminal`.
 * Supports a simple `{VAR}` placeholder syntax — clicking prompts for values.
 *
 * This is separate from the editor code snippets library; these are
 * terminal shell commands.
 */
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";

// ── Storage ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = "nexis:shell-snippets";

export type ShellSnippet = {
  id: string;
  name: string;
  command: string;
  description?: string;
  createdAt: number;
};

function load(): ShellSnippet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ShellSnippet[]) : defaultSnippets();
  } catch {
    return defaultSnippets();
  }
}

function save(snippets: ShellSnippet[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets));
}

function defaultSnippets(): ShellSnippet[] {
  return [
    { id: "gs", name: "git status", command: "git status", createdAt: Date.now() },
    { id: "glog", name: "git log --oneline", command: "git log --oneline -20", createdAt: Date.now() },
    { id: "dc-up", name: "docker compose up", command: "docker compose up -d", createdAt: Date.now() },
    { id: "npmrd", name: "npm run dev", command: "npm run dev", createdAt: Date.now() },
    { id: "lsa", name: "ls -la", command: "ls -la", createdAt: Date.now() },
  ];
}

function newId(): string {
  return `sh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Extract `{VAR}` placeholders from a command string */
function extractPlaceholders(cmd: string): string[] {
  const matches = cmd.match(/\{([^}]+)\}/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(1, -1)))];
}

/** Replace `{VAR}` tokens with values from a map */
function fillPlaceholders(cmd: string, values: Record<string, string>): string {
  return cmd.replace(/\{([^}]+)\}/g, (_, key: string) => values[key] ?? `{${key}}`);
}

// ── Module-level terminal sender — set by App.tsx ────────────────────────────

let _sendFn: ((text: string) => void) | null = null;

export function setShellSnippetSender(fn: (text: string) => void): void {
  _sendFn = fn;
}

// ── Component ─────────────────────────────────────────────────────────────────

type EditState = {
  id: string | null;
  name: string;
  command: string;
  description: string;
};

type FillState = {
  snippet: ShellSnippet;
  placeholders: string[];
  values: Record<string, string>;
};

export function ShellSnippetsPanel() {
  const [snippets, setSnippets] = useState<ShellSnippet[]>(() => load());
  const [editing, setEditing] = useState<EditState | null>(null);
  const [filling, setFilling] = useState<FillState | null>(null);
  const [query, setQuery] = useState("");
  const [fired, setFired] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { save(snippets); }, [snippets]);

  const filtered = snippets.filter(
    (s) =>
      !query ||
      s.name.toLowerCase().includes(query.toLowerCase()) ||
      s.command.toLowerCase().includes(query.toLowerCase()),
  );

  const run = useCallback((snippet: ShellSnippet) => {
    const placeholders = extractPlaceholders(snippet.command);
    if (placeholders.length > 0) {
      setFilling({ snippet, placeholders, values: {} });
      return;
    }
    doRun(snippet.id, snippet.command);
  }, []);

  const doRun = (id: string, cmd: string) => {
    if (_sendFn) {
      _sendFn(cmd + "\r");
      setFired(id);
      setTimeout(() => setFired(null), 1200);
    }
  };

  const commitFill = useCallback(() => {
    if (!filling) return;
    const cmd = fillPlaceholders(filling.snippet.command, filling.values);
    doRun(filling.snippet.id, cmd);
    setFilling(null);
  }, [filling]);

  const startEdit = useCallback((s?: ShellSnippet) => {
    setEditing(
      s
        ? { id: s.id, name: s.name, command: s.command, description: s.description ?? "" }
        : { id: null, name: "", command: "", description: "" },
    );
    setTimeout(() => nameRef.current?.focus(), 40);
  }, []);

  const saveEdit = useCallback(() => {
    if (!editing) return;
    const name = editing.name.trim();
    const command = editing.command.trim();
    if (!name || !command) return;

    if (editing.id === null) {
      const sn: ShellSnippet = { id: newId(), name, command, description: editing.description.trim() || undefined, createdAt: Date.now() };
      setSnippets((p) => [...p, sn]);
    } else {
      setSnippets((p) =>
        p.map((s) => s.id === editing.id ? { ...s, name, command, description: editing.description.trim() || undefined } : s),
      );
    }
    setEditing(null);
  }, [editing]);

  const del = useCallback((id: string) => {
    setSnippets((p) => p.filter((s) => s.id !== id));
  }, []);

  const handleEditKey = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); saveEdit(); }
    if (e.key === "Escape") setEditing(null);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <Icon name="terminal" className="text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Shell Snippets
        </span>
        <button
          type="button"
          title="New snippet"
          onClick={() => startEdit()}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Icon name="add" />
        </button>
      </div>

      {/* Search */}
      <div className="shrink-0 border-b border-border/30 px-3 py-1.5">
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter snippets"
          placeholder="Filter snippets…"
          className="w-full rounded border border-border/50 bg-muted/20 px-2.5 py-1 text-[11px] text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-primary/60"
        />
      </div>

      {/* Placeholder fill dialog */}
      {filling && (
        <div className="shrink-0 border-b border-border/40 bg-muted/10 p-3 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Fill placeholders for: <span className="text-foreground">{filling.snippet.name}</span>
          </p>
          {filling.placeholders.map((key) => (
            <div key={key} className="flex items-center gap-2">
              <label htmlFor={`snippet-fill-${key}`} className="w-20 shrink-0 truncate text-[10.5px] text-muted-foreground">{"{" + key + "}"}</label>
              <input
                id={`snippet-fill-${key}`}
                value={filling.values[key] ?? ""}
                onChange={(e) =>
                  setFilling((f) => f ? { ...f, values: { ...f.values, [key]: e.target.value } } : null)
                }
                onKeyDown={(e) => { if (e.key === "Enter") commitFill(); if (e.key === "Escape") setFilling(null); }}
                aria-label={`Value for ${key}`}
                // The fill dialog exists solely to collect these values and is
                // opened by an explicit user action, so focusing its first
                // field is the point of opening it.
                // react-doctor-disable-next-line react-doctor/no-autofocus
                autoFocus
                className="flex-1 rounded border border-border/60 bg-background/60 px-2 py-1 text-[11px] text-foreground outline-none focus:border-primary/60"
              />
            </div>
          ))}
          <div className="flex gap-1">
            <button
              type="button"
              onClick={commitFill}
              className="flex flex-1 items-center justify-center gap-1 rounded bg-primary/90 py-1 text-[10.5px] font-medium text-primary-foreground hover:bg-primary"
            >
              <Icon name="terminal" size="xs" />
              Run
            </button>
            <button
              type="button"
              onClick={() => setFilling(null)}
              aria-label="Cancel"
              className="flex items-center justify-center rounded border border-border/50 px-2 py-1 text-[10.5px] text-muted-foreground hover:bg-muted/40"
            >
              <Icon name="close" size="xs" />
            </button>
          </div>
        </div>
      )}

      {/* Edit form */}
      {editing !== null && (
        <div className="shrink-0 border-b border-border/40 bg-muted/10 p-3 space-y-1.5" onKeyDown={handleEditKey}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {editing.id === null ? "New snippet" : "Edit snippet"}
          </p>
          <input
            ref={nameRef}
            value={editing.name}
            onChange={(e) => setEditing((p) => p && { ...p, name: e.target.value })}
            aria-label="Snippet name"
            placeholder="Name"
            className="w-full rounded border border-border/60 bg-background/60 px-2 py-1 text-[11px] text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-primary/60"
          />
          <input
            value={editing.command}
            onChange={(e) => setEditing((p) => p && { ...p, command: e.target.value })}
            aria-label="Shell command (use {VAR} for placeholders)"
            placeholder="Shell command (use {VAR} for placeholders)"
            className="w-full rounded border border-border/60 bg-background/60 px-2 py-1 font-mono text-[11px] text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-primary/60"
          />
          <input
            value={editing.description}
            onChange={(e) => setEditing((p) => p && { ...p, description: e.target.value })}
            aria-label="Snippet description (optional)"
            placeholder="Description (optional)"
            className="w-full rounded border border-border/60 bg-background/60 px-2 py-1 text-[11px] text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-primary/60"
          />
          <div className="flex gap-1">
            <button
              type="button"
              onClick={saveEdit}
              disabled={!editing.name.trim() || !editing.command.trim()}
              className="flex flex-1 items-center justify-center gap-1 rounded bg-primary/90 py-1.5 text-[10.5px] font-medium text-primary-foreground hover:bg-primary disabled:opacity-40"
            >
              <Icon name="check" size="xs" />
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              aria-label="Cancel editing"
              className="flex items-center justify-center rounded border border-border/50 px-2 py-1.5 text-[10.5px] text-muted-foreground hover:bg-muted/40"
            >
              <Icon name="close" size="xs" />
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <p className="text-[11px] text-muted-foreground/60">
              {query ? "No snippets match." : "No snippets yet."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/20">
            {filtered.map((s) => (
              <div key={s.id} className="group flex items-start gap-2 px-3 py-2 hover:bg-muted/20">
                {/* Run button */}
                <button
                  type="button"
                  title={_sendFn ? "Run in terminal" : "No active terminal"}
                  onClick={() => run(s)}
                  disabled={!_sendFn}
                  className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors",
                    fired === s.id
                      ? "text-green-500"
                      : "text-muted-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-30",
                  )}
                >
                  <Icon name={fired === s.id ? "check" : "terminal"} size="xs" />
                </button>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11.5px] font-medium text-foreground">
                    {s.name}
                  </p>
                  <code className="block truncate text-[10.5px] text-muted-foreground/70">
                    {s.command}
                  </code>
                  {s.description && (
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground/50">
                      {s.description}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    title="Edit"
                    onClick={() => startEdit(s)}
                    className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Icon name="edit" size="xs" />
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    onClick={() => del(s.id)}
                    className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                  >
                    <Icon name="delete" size="xs" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border/20 px-3 py-1.5">
        <p className="text-[9.5px] text-muted-foreground/40">
          Use <code className="rounded bg-muted px-0.5">{"{VAR}"}</code> for interactive placeholders.
        </p>
      </div>
    </div>
  );
}
