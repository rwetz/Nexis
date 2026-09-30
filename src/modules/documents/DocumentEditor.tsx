// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * One document tab: load the file, edit it in Tiptap, and write it back in
 * the format it came in.
 *
 * Both formats have a way to lose the user's work on save, and each is
 * handled before the first keystroke rather than after the damage:
 * - markdown the editor cannot represent (frontmatter, raw HTML, footnotes)
 *   opens read-only, with "Edit raw" (CodeMirror) or an explicit override;
 * - a .docx is rebuilt, never patched, so the first save of one holding
 *   headers, comments, tracked changes and so on asks first and defaults
 *   to a copy (`SaveDocxDialog`).
 */
import "./documents.css";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { Extension, type Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { basename } from "@/lib/path";
import { filesystem, hostFilesystem } from "@/platform/filesystem";
import { saveFile } from "@/platform/dialogs";
import type { DocumentTab } from "@/modules/tabs";
import { documentExtensions } from "./lib/extensions";
import {
  detectMarkdownHazards,
  HAZARD_LABELS,
  normalizeMarkdownOutput,
  type MarkdownHazard,
} from "./lib/markdownFormat";
import { docxToHtml, jsonToDocx } from "./lib/docxFormat";
import { DOCX_LOSS_LABELS, inspectDocx, type DocxLoss } from "./lib/docxInspect";
import { copyPathFor, pdfPathFor } from "./lib/paths";
import { PDF_THEMES, type PdfPageSize } from "./lib/pdfThemes";
import { renderDocumentPdf } from "./lib/pdfExport";
import { SaveDocxDialog } from "./SaveDocxDialog";
import { DocumentToolbar } from "./Toolbar";

type Props = {
  tab: DocumentTab;
  visible: boolean;
  onDirtyChange: (id: number, dirty: boolean) => void;
  /** The tab now points at a different file (a .docx saved as a copy). */
  onRepoint: (id: number, path: string) => void;
  /** Open the file as source in the code editor. */
  onEditRaw: (path: string) => void;
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready" };

const exists = (p: string) => filesystem.stat(p).then(() => true, () => false);

/**
 * Reads the tab's file into the editor once the editor exists, and reports
 * what it found: markdown hazards, or what a .docx rebuild would lose. Keyed
 * on the path by the parent, so a re-pointed tab remounts and reloads.
 */
function useDocumentLoad(editor: Editor | null, tab: DocumentTab) {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [hazards, setHazards] = useState<MarkdownHazard[]>([]);
  const [losses, setLosses] = useState<DocxLoss[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    void (async () => {
      try {
        if (tab.format === "markdown") {
          const res = await filesystem.readFile(tab.path);
          if (res.kind !== "text") {
            throw new Error(res.kind === "binary" ? "This file is not text." : "This file is too large to open.");
          }
          if (cancelled) return;
          setHazards(detectMarkdownHazards(res.content));
          // Out of the undo history: Ctrl+Z must not "undo" the file away.
          editor
            .chain()
            .setMeta("addToHistory", false)
            .setContent(res.content, { emitUpdate: false, contentType: "markdown" })
            .run();
        } else {
          const bytes = await filesystem.readFileBytes(tab.path);
          const [imported, found] = await Promise.all([docxToHtml(bytes), inspectDocx(bytes)]);
          if (cancelled) return;
          setLosses(found);
          setWarnings(imported.warnings);
          editor
            .chain()
            .setMeta("addToHistory", false)
            .setContent(imported.html, { emitUpdate: false })
            .run();
        }
        setLoad({ status: "ready" });
      } catch (e) {
        if (!cancelled) setLoad({ status: "error", message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editor, tab.format, tab.path]);
  return { load, hazards, losses, setLosses, warnings };
}

/** Ask where to save, render with Forme, and write it. Errors become toasts. */
async function exportDocumentPdf(editor: Editor, tab: DocumentTab, themeId: string, size: PdfPageSize) {
  const target = await saveFile({
    defaultPath: pdfPathFor(tab.path),
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (!target) return;
  try {
    const theme = PDF_THEMES.find((t) => t.id === themeId) ?? PDF_THEMES[0];
    const title = tab.title.replace(/\.[^.]+$/, "");
    const bytes = await renderDocumentPdf(editor.getJSON(), { title, theme, size });
    // The dialog hands back a host path, whatever workspace is open.
    await hostFilesystem.writeFileBytes(target, bytes);
    toast.success(`Exported ${basename(target)}`);
  } catch (e) {
    toast.error("PDF export failed", { description: e instanceof Error ? e.message : String(e) });
  }
}

function OpenError({ title, message, onEditRaw }: { title: string; message: string; onEditRaw: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <Icon name="alert-circle" size="xl" className="text-muted-foreground" />
      <div className="text-sm">Could not open {title}</div>
      <div className="max-w-md text-xs text-muted-foreground">{message}</div>
      <Button variant="outline" size="sm" onClick={onEditRaw}>
        Open as source
      </Button>
    </div>
  );
}

/** Markdown the editor would change on save: read-only until the user chooses. */
function HazardBanner({
  hazards,
  onEditRaw,
  onOverride,
}: {
  hazards: readonly MarkdownHazard[];
  onEditRaw: () => void;
  onOverride: () => void;
}) {
  return (
    <div role="status" className="flex items-start gap-2 border-b border-border/60 bg-muted/50 px-3 py-2 text-xs">
      <Icon name="alert" size="sm" className="mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        Read-only: this file uses {hazards.map((h) => HAZARD_LABELS[h]).join(", ")}, which the rich editor would
        change on save.
      </div>
      <Button variant="outline" size="xs" onClick={onEditRaw}>
        Edit raw
      </Button>
      <Button variant="ghost" size="xs" onClick={onOverride}>
        Edit anyway
      </Button>
    </div>
  );
}

/** What a .docx rebuild would drop, plus mammoth's notes, behind a disclosure. */
function LossReport({ losses, warnings }: { losses: readonly DocxLoss[]; warnings: readonly string[] }) {
  const [open, setOpen] = useState(false);
  if (losses.length === 0 && warnings.length === 0) return null;
  return (
    <div role="status" className="border-b border-border/60 bg-muted/50 px-3 py-2 text-xs">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="info" size="sm" className="shrink-0 text-muted-foreground" />
        <span className="flex-1">
          {losses.length > 0
            ? `Some of this document is not shown and would not be saved (${losses.length}).`
            : "Opened with conversion notes."}
        </span>
        <Icon name={open ? "chevron-up" : "chevron-down"} size="xs" />
      </button>
      {open ? (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-8 text-muted-foreground">
          {losses.map((l) => (
            <li key={l}>{DOCX_LOSS_LABELS[l]}</li>
          ))}
          {warnings.slice(0, 8).map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function DocumentEditor({ tab, visible, onDirtyChange, onRepoint, onEditRaw }: Props) {
  const [hazardsOverridden, setHazardsOverridden] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // The keyboard shortcut is registered once, with the editor; it calls
  // through this ref so it always reaches the current save closure. Written
  // in an effect below, never during render.
  const saveRef = useRef<() => void>(() => {});
  const extensions = useMemo(
    () => [
      ...documentExtensions(),
      Extension.create({
        name: "nexisSave",
        addKeyboardShortcuts: () => ({
          "Mod-s": () => {
            saveRef.current();
            return true;
          },
        }),
      }),
    ],
    [],
  );

  const editor = useEditor({
    extensions,
    editable: false,
    editorProps: { attributes: { spellcheck: "true", "aria-label": `Document ${tab.title}` } },
  });

  const { load, hazards, losses, setLosses, warnings } = useDocumentLoad(editor, tab);
  const editable = load.status === "ready" && (hazards.length === 0 || hazardsOverridden);

  useEffect(() => {
    // `false`: setEditable emits an `update` by default, which the dirty
    // tracking below would read as an edit, so every file opened dirty.
    editor?.setEditable(editable, false);
  }, [editor, editable]);

  // Dirtiness is reported to the tab strip from the event that changes it,
  // and only on a transition: `update` fires on every keystroke, and each
  // report re-renders App.
  const dirtyRef = useRef(false);
  const markDirty = useCallback(
    (next: boolean) => {
      if (dirtyRef.current === next) return;
      dirtyRef.current = next;
      setDirty(next);
      onDirtyChange(tab.id, next);
    },
    [onDirtyChange, tab.id],
  );

  // The editor's listener is registered once per editor, so it reaches the
  // current `markDirty` through an effect event rather than a stale closure.
  // Loading content never counts: it is written with emitUpdate false, so
  // only real edits reach it.
  const onEdit = useEffectEvent(() => markDirty(true));
  useEffect(() => {
    if (!editor) return;
    const onUpdate = () => onEdit();
    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
    };
  }, [editor]);

  const write = async (mode?: "copy" | "overwrite") => {
    if (!editor || saving) return;
    setSaving(true);
    try {
      if (tab.format === "markdown") {
        await filesystem.writeFile(tab.path, normalizeMarkdownOutput(editor.getMarkdown()), "documents");
      } else {
        const bytes = await jsonToDocx(editor.getJSON());
        const target = mode === "copy" ? await copyPathFor(tab.path, exists) : tab.path;
        await filesystem.writeFileBytes(target, bytes);
        // Whatever is on disk now is this editor's own output, so there is
        // nothing left in it that a later save could lose.
        setLosses([]);
        if (target !== tab.path) {
          toast.success(`Saved as ${basename(target)}`, { description: `${basename(tab.path)} was not changed.` });
          onRepoint(tab.id, target);
        }
      }
      markDirty(false);
    } catch (e) {
      toast.error(`Could not save ${tab.title}`, { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    if (!editable || !dirty) return;
    if (tab.format === "docx" && losses.length > 0) {
      setSaveDialogOpen(true);
      return;
    }
    void write();
  };

  useEffect(() => {
    saveRef.current = save;
  });

  const exportPdf = (themeId: string, size: PdfPageSize) =>
    editor ? exportDocumentPdf(editor, tab, themeId, size) : Promise.resolve();

  if (load.status === "error") {
    return <OpenError title={tab.title} message={load.message} onEditRaw={() => onEditRaw(tab.path)} />;
  }

  return (
    <div className="nx-doc flex h-full min-h-0 flex-col" aria-hidden={!visible}>
      {editor ? (
        <DocumentToolbar
          editor={editor}
          editable={editable}
          dirty={dirty && !saving}
          onSave={save}
          onExportPdf={exportPdf}
        />
      ) : null}

      {hazards.length > 0 && !hazardsOverridden ? (
        <HazardBanner
          hazards={hazards}
          onEditRaw={() => onEditRaw(tab.path)}
          onOverride={() => setHazardsOverridden(true)}
        />
      ) : null}
      {tab.format === "docx" ? <LossReport losses={losses} warnings={warnings} /> : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-6">
        {load.status === "loading" ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Opening...</div>
        ) : null}
        <EditorContent editor={editor} className={load.status === "loading" ? "hidden" : "h-full"} />
      </div>

      <SaveDocxDialog
        open={saveDialogOpen}
        path={tab.path}
        losses={losses}
        onOpenChange={setSaveDialogOpen}
        onChoose={(mode) => {
          setSaveDialogOpen(false);
          void write(mode);
        }}
      />
    </div>
  );
}
