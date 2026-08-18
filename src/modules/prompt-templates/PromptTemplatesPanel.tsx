// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * PromptTemplatesPanel — save and run reusable AI prompt templates.
 *
 * Templates are stored in localStorage under "nexis:prompt-templates".
 * Clicking a template sends its prompt to the AI panel instantly.
 * Users can create / edit / delete templates. Ctrl+Enter to save.
 */
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { sendMessage } from "@/modules/ai/store/chatStore";
import { useCallback, useEffect, useRef, useState } from "react";

// ── Storage ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = "nexis:prompt-templates";

export type PromptTemplate = {
  id: string;
  name: string;
  prompt: string;
  createdAt: number;
};

function loadTemplates(): PromptTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PromptTemplate[]) : defaultTemplates();
  } catch {
    return defaultTemplates();
  }
}

function saveTemplates(templates: PromptTemplate[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

function defaultTemplates(): PromptTemplate[] {
  return [
    {
      id: "explain",
      name: "Explain this code",
      prompt: "Explain what the selected code does in plain English, step by step.",
      createdAt: Date.now(),
    },
    {
      id: "tests",
      name: "Write tests",
      prompt:
        "Write comprehensive unit tests for the selected code. Use the testing framework already in this project. Cover edge cases and error paths.",
      createdAt: Date.now(),
    },
    {
      id: "review",
      name: "Code review",
      prompt:
        "Review the selected code for correctness, performance, security issues, and maintainability. List specific improvements with explanations.",
      createdAt: Date.now(),
    },
    {
      id: "docs",
      name: "Add documentation",
      prompt:
        "Add thorough JSDoc / docstring comments to the selected code. Document parameters, return values, side effects, and edge cases.",
      createdAt: Date.now(),
    },
  ];
}

function newId(): string {
  return `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

type EditState = {
  id: string | null; // null = new
  name: string;
  prompt: string;
};

export function PromptTemplatesPanel() {
  const [templates, setTemplates] = useState<PromptTemplate[]>(() => loadTemplates());
  const [editing, setEditing] = useState<EditState | null>(null);
  const [fired, setFired] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // Persist on change
  useEffect(() => {
    saveTemplates(templates);
  }, [templates]);

  const startNew = useCallback(() => {
    setEditing({ id: null, name: "", prompt: "" });
    setTimeout(() => nameRef.current?.focus(), 50);
  }, []);

  const startEdit = useCallback((t: PromptTemplate) => {
    setEditing({ id: t.id, name: t.name, prompt: t.prompt });
    setTimeout(() => nameRef.current?.focus(), 50);
  }, []);

  const cancelEdit = useCallback(() => setEditing(null), []);

  const saveEdit = useCallback(() => {
    if (!editing) return;
    const name = editing.name.trim();
    const prompt = editing.prompt.trim();
    if (!name || !prompt) return;

    if (editing.id === null) {
      // New
      const tpl: PromptTemplate = { id: newId(), name, prompt, createdAt: Date.now() };
      setTemplates((prev) => [...prev, tpl]);
    } else {
      // Update
      setTemplates((prev) =>
        prev.map((t) => (t.id === editing.id ? { ...t, name, prompt } : t)),
      );
    }
    setEditing(null);
  }, [editing]);

  const deleteTemplate = useCallback((id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const fireTemplate = useCallback(
    (t: PromptTemplate) => {
      sendMessage(t.prompt);
      setFired(t.id);
      setTimeout(() => setFired(null), 1500);
    },
    [],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        saveEdit();
      }
      if (e.key === "Escape") cancelEdit();
    },
    [saveEdit, cancelEdit],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <Icon name="flash" className="text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Prompt Templates
        </span>
        <button
          type="button"
          title="New template"
          onClick={startNew}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Icon name="add" />
        </button>
      </div>

      {/* Edit form */}
      {editing !== null && (
        <div
          className="shrink-0 border-b border-border/40 bg-muted/10 p-3 space-y-2"
          onKeyDown={handleKeyDown}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {editing.id === null ? "New template" : "Edit template"}
          </p>
          <input
            ref={nameRef}
            value={editing.name}
            onChange={(e) => setEditing((prev) => prev && { ...prev, name: e.target.value })}
            aria-label="Template name"
            placeholder="Template name"
            className="w-full rounded border border-border/60 bg-background/60 px-2.5 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/60"
          />
          <textarea
            ref={promptRef}
            value={editing.prompt}
            onChange={(e) =>
              setEditing((prev) => prev && { ...prev, prompt: e.target.value })
            }
            aria-label="Prompt text"
            placeholder="Prompt text…"
            rows={5}
            className="w-full rounded border border-border/60 bg-background/60 px-2.5 py-1.5 text-xs text-foreground outline-none resize-none placeholder:text-muted-foreground/50 focus:border-primary/60"
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={saveEdit}
              disabled={!editing.name.trim() || !editing.prompt.trim()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded bg-primary/90 py-1.5 text-[10.5px] font-medium text-primary-foreground hover:bg-primary disabled:opacity-40"
            >
              <Icon name="check" size="xs" />
              Save
              <span className="opacity-50">(Ctrl+↵)</span>
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="flex items-center justify-center gap-1 rounded border border-border/50 px-2.5 py-1.5 text-[10.5px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            >
              <Icon name="close" size="xs" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {templates.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
            <p className="text-[11px] text-muted-foreground/60">
              No templates yet.
              <br />
              Click <strong>+</strong> to create a reusable AI prompt.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/20">
            {templates.map((t) => (
              <div
                key={t.id}
                className="group flex items-start gap-2 px-3 py-2.5 hover:bg-muted/20"
              >
                {/* Run button */}
                <button
                  type="button"
                  title="Send to AI"
                  onClick={() => fireTemplate(t)}
                  className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors",
                    fired === t.id
                      ? "text-green-500"
                      : "text-muted-foreground hover:bg-primary/10 hover:text-primary",
                  )}
                >
                  <Icon name={fired === t.id ? "check" : "flash"} />
                </button>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11.5px] font-medium text-foreground">
                    {t.name}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground/60">
                    {t.prompt}
                  </p>
                </div>

                {/* Actions (visible on hover) */}
                <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    title="Edit"
                    onClick={() => startEdit(t)}
                    className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Icon name="edit" size="xs" />
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    onClick={() => deleteTemplate(t.id)}
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

      {/* Footer hint */}
      <div className="shrink-0 border-t border-border/30 px-3 py-2">
        <p className="text-[9.5px] text-muted-foreground/40">
          Click <Icon name="flash" size="xs" className="inline" /> to send a template directly to the AI panel.
        </p>
      </div>
    </div>
  );
}
