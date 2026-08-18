// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * WorkspaceNotesPanel — a quick Markdown scratch-pad per workspace.
 *
 * Notes are saved to `{workspaceRoot}/.nexis/NOTES.md` using the existing
 * fs IPC commands.  The panel renders a plain textarea for editing; a toggle
 * button shows a live Markdown preview using the existing Markdown renderer.
 *
 * Auto-saves on every keystroke (debounced 800 ms).
 */
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { native } from "@/modules/ai/lib/native";
import { invoke } from "@tauri-apps/api/core";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type Props = {
  workspaceRoot: string | null;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 800;

function notesPath(root: string): string {
  return `${root}/.nexis/NOTES.md`.replace(/\\/g, "/");
}

export function WorkspaceNotesPanel({ workspaceRoot }: Props) {
  const [text, setText] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [preview, setPreview] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRootRef = useRef<string | null>(null);

  // Load notes when workspace root changes
  useEffect(() => {
    if (!workspaceRoot) {
      setText("");
      setLoaded(false);
      return;
    }
    if (workspaceRoot === lastRootRef.current) return;
    lastRootRef.current = workspaceRoot;

    let cancelled = false;
    const path = notesPath(workspaceRoot);
    (async () => {
      try {
        const result = await native.readFile(path);
        if (cancelled) return;
        if (result.kind === "text") {
          setText(result.content);
        } else {
          setText("");
        }
      } catch {
        if (!cancelled) setText("");
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [workspaceRoot]);

  const saveNow = useCallback(
    async (content: string) => {
      if (!workspaceRoot) return;
      setSaveStatus("saving");
      try {
        // Ensure .nexis directory exists
        await invoke("fs_create_dir", {
          path: `${workspaceRoot}/.nexis`,
        }).catch(() => undefined);
        await invoke("fs_write_file", {
          path: notesPath(workspaceRoot),
          content,
        });
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 1500);
      } catch {
        setSaveStatus("error");
      }
    },
    [workspaceRoot],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setText(val);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void saveNow(val), DEBOUNCE_MS);
    },
    [saveNow],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const statusIcon = saveStatus === "saving"
    ? <span className="text-[9.5px] text-muted-foreground/50">Saving…</span>
    : saveStatus === "saved"
    ? <Icon name="check" size="xs" className="text-green-500" />
    : saveStatus === "error"
    ? <span className="text-[9.5px] text-red-500">Save failed</span>
    : null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <Icon name="file-edit" className="text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Notes
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {statusIcon}
          <button
            type="button"
            title={preview ? "Edit" : "Preview"}
            onClick={() => setPreview((v) => !v)}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              preview && "bg-primary/10 text-primary",
            )}
          >
            <Icon name={preview ? "edit" : "refresh"} />
          </button>
        </div>
      </div>

      {/* Content */}
      {!workspaceRoot ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center">
          <p className="text-[11px] text-muted-foreground/60">No workspace open</p>
        </div>
      ) : !loaded ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[11px] text-muted-foreground/40">Loading…</p>
        </div>
      ) : preview ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          <MarkdownPreview text={text} />
        </div>
      ) : (
        <textarea
          value={text}
          onChange={handleChange}
          aria-label="Workspace notes"
          placeholder={`# Workspace notes\n\nWrite anything here — saved to .nexis/NOTES.md\n\nSupports Markdown.`}
          spellCheck={false}
          className={cn(
            "flex-1 resize-none bg-transparent px-3 py-2 font-mono text-[12px]",
            "leading-relaxed text-foreground outline-none",
            "placeholder:text-muted-foreground/30",
          )}
        />
      )}

      {/* Footer */}
      {workspaceRoot && loaded && (
        <div className="shrink-0 border-t border-border/20 px-3 py-1">
          <p className="truncate text-[9px] text-muted-foreground/30">
            .nexis/NOTES.md
          </p>
        </div>
      )}
    </div>
  );
}

// ── Minimal Markdown preview ──────────────────────────────────────────────────

/**
 * Render Markdown as safe HTML using a minimal subset of patterns.
 * No external deps — just a few string replacements.
 */
function MarkdownPreview({ text }: { text: string }) {
  if (!text.trim()) {
    return (
      <p className="text-[11px] italic text-muted-foreground/40">Nothing to preview.</p>
    );
  }

  const html = mdToHtml(text);
  return (
    <div
      className="prose prose-sm prose-invert max-w-none text-[12px] [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:text-[11px] [&_h1]:text-[14px] [&_h2]:text-[13px] [&_h3]:text-[12px] [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted/40 [&_pre]:p-2"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function mdToHtml(md: string): string {
  let html = md
    // Escape HTML entities first
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Headings
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Bold/italic
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Code blocks (``` fenced)
    .replace(/```[\s\S]*?```/g, (m) => {
      const inner = m.replace(/^```[^\n]*\n?/, "").replace(/\n?```$/, "");
      return `<pre><code>${inner}</code></pre>`;
    })
    // Unordered lists
    .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
    // Horizontal rule
    .replace(/^---+$/gm, "<hr/>")
    // Links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    // Paragraphs — wrap consecutive non-tag lines
    .split("\n\n")
    .map((block) => {
      if (block.startsWith("<")) return block;
      if (!block.trim()) return "";
      return `<p>${block.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("\n");

  // Wrap consecutive <li> in <ul>
  html = html.replace(/(<li>[\s\S]*?<\/li>(\n)?)+/g, (m) => `<ul>${m}</ul>`);

  return html;
}
