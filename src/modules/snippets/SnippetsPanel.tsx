import { cn } from "@/lib/utils";
import {
  Add01Icon,
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Delete02Icon,
  Edit02Icon,
  FileCodeIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import { LANGUAGE_OPTIONS, type CodeSnippet } from "./codeSnippets";
import { newCodeSnippetId, useCodeSnippetsStore } from "./codeSnippetsStore";

type EditorState = {
  id: string;
  name: string;
  prefix: string;
  language: string;
  body: string;
  description: string;
};

function blank(): EditorState {
  return { id: newCodeSnippetId(), name: "", prefix: "", language: "any", body: "", description: "" };
}

export function SnippetsPanel() {
  const { snippets, hydrate, upsert, remove } = useCodeSnippetsStore();
  const [editing, setEditing] = useState<EditorState | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void hydrate(); }, [hydrate]);

  useEffect(() => {
    if (editing) nameRef.current?.focus();
  }, [editing]);

  function startNew() {
    setEditing(blank());
  }

  function startEdit(s: CodeSnippet) {
    setEditing({ id: s.id, name: s.name, prefix: s.prefix, language: s.language, body: s.body, description: s.description ?? "" });
  }

  function save() {
    if (!editing) return;
    if (!editing.name.trim() || !editing.prefix.trim() || !editing.body.trim()) return;
    upsert({
      id: editing.id,
      name: editing.name.trim(),
      prefix: editing.prefix.trim(),
      language: editing.language,
      body: editing.body,
      description: editing.description.trim() || undefined,
    });
    setEditing(null);
  }

  function cancel() {
    setEditing(null);
  }

  const grouped = LANGUAGE_OPTIONS.filter((lang) =>
    snippets.some((s) => s.language === lang)
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 bg-gradient-to-r from-primary/[0.04] to-transparent px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Snippets
        </span>
        <button
          type="button"
          onClick={startNew}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <HugeiconsIcon icon={Add01Icon} size={12} strokeWidth={1.75} />
          New
        </button>
      </div>

      {editing ? (
        <div className="flex flex-col gap-2 overflow-y-auto p-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-muted-foreground">Name</label>
            <input
              ref={nameRef}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="My snippet"
              className="rounded border border-border/60 bg-muted/40 px-2 py-1 text-[12px] text-foreground outline-none focus:border-primary/60"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-[10px] text-muted-foreground">Prefix (trigger)</label>
              <input
                value={editing.prefix}
                onChange={(e) => setEditing({ ...editing, prefix: e.target.value })}
                placeholder="cl"
                className="rounded border border-border/60 bg-muted/40 px-2 py-1 font-mono text-[12px] text-foreground outline-none focus:border-primary/60"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-[10px] text-muted-foreground">Language</label>
              <select
                value={editing.language}
                onChange={(e) => setEditing({ ...editing, language: e.target.value })}
                className="rounded border border-border/60 bg-muted/40 px-2 py-1 text-[12px] text-foreground outline-none focus:border-primary/60"
              >
                {LANGUAGE_OPTIONS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-muted-foreground">
              Body <span className="text-muted-foreground/60">(use $1, $2… for tab stops, $0 for final cursor)</span>
            </label>
            <textarea
              value={editing.body}
              onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              placeholder={"console.log($1);"}
              rows={5}
              className="resize-none rounded border border-border/60 bg-muted/40 px-2 py-1 font-mono text-[12px] text-foreground outline-none focus:border-primary/60"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-muted-foreground">Description (optional)</label>
            <input
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              placeholder="Short description"
              className="rounded border border-border/60 bg-muted/40 px-2 py-1 text-[12px] text-foreground outline-none focus:border-primary/60"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={!editing.name.trim() || !editing.prefix.trim() || !editing.body.trim()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded bg-primary/90 px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <HugeiconsIcon icon={CheckmarkCircle01Icon} size={12} strokeWidth={1.75} />
              Save
            </button>
            <button
              type="button"
              onClick={cancel}
              className="flex items-center gap-1.5 rounded border border-border/60 px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={1.75} />
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="nexis-scrollbar flex-1 overflow-y-auto">
          {snippets.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-center">
                <HugeiconsIcon icon={FileCodeIcon} size={28} strokeWidth={1.25} className="text-muted-foreground/30" />
                <p className="text-[11px] text-muted-foreground/60">No snippets yet</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col">
              {grouped.map((lang) => {
                const group = snippets.filter((s) => s.language === lang);
                if (group.length === 0) return null;
                return (
                  <div key={lang}>
                    <div className="border-b border-border/30 bg-muted/20 px-3 py-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                        {lang}
                      </span>
                    </div>
                    {group.map((s) => (
                      <SnippetRow key={s.id} snippet={s} onEdit={startEdit} onRemove={remove} />
                    ))}
                  </div>
                );
              })}
              {snippets.some((s) => !LANGUAGE_OPTIONS.includes(s.language)) && (
                <div>
                  <div className="border-b border-border/30 bg-muted/20 px-3 py-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">other</span>
                  </div>
                  {snippets
                    .filter((s) => !LANGUAGE_OPTIONS.includes(s.language))
                    .map((s) => (
                      <SnippetRow key={s.id} snippet={s} onEdit={startEdit} onRemove={remove} />
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SnippetRow({
  snippet,
  onEdit,
  onRemove,
}: {
  snippet: CodeSnippet;
  onEdit: (s: CodeSnippet) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className={cn("group flex items-start gap-2 border-b border-border/20 px-3 py-2 last:border-none hover:bg-muted/30")}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[11px] font-semibold text-primary/80">{snippet.prefix}</span>
          <span className="text-[10px] text-muted-foreground/60">→</span>
          <span className="text-[11px] text-foreground/80">{snippet.name}</span>
        </div>
        {snippet.description && (
          <p className="mt-0.5 text-[10px] text-muted-foreground/60">{snippet.description}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={() => onEdit(snippet)}
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <HugeiconsIcon icon={Edit02Icon} size={12} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={() => onRemove(snippet.id)}
          className="rounded p-0.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
        >
          <HugeiconsIcon icon={Delete02Icon} size={12} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
