// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The formatting strip. Laid out after editorcn's fixed toolbar
 * (https://github.com/shadcn-labs/editorcn, MIT, Copyright (c) 2026 Abdullah
 * Mukadam) and rebuilt on Nexis's own Button, Icon and tokens.
 *
 * Active states come from `useEditorState` with a selector, so the strip
 * re-renders when the selection's marks change and not on every keystroke.
 */
import { useState, type ReactNode } from "react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { Icon, type IconName } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { isAllowedHref } from "./lib/extensions";
import { PDF_THEMES, type PdfPageSize } from "./lib/pdfThemes";

function ToolButton({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      // Keep the editor's selection: a mousedown on the button would
      // otherwise blur the editor before the command runs.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(active && "bg-muted text-foreground")}
    >
      <Icon name={icon} size="sm" active={active} />
    </Button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-border/70" />;
}

function LinkButton({ editor, active, disabled }: { editor: Editor; active: boolean; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState("");
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    const value = href.trim();
    if (!value) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setOpen(false);
      return;
    }
    if (!isAllowedHref(value)) {
      setError("Only http, https and mailto links are allowed.");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: value }).run();
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setHref(String(editor.getAttributes("link").href ?? ""));
          setError(null);
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Link"
          title="Link"
          aria-pressed={active}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          className={cn(active && "bg-muted text-foreground")}
        >
          <Icon name="link" size="sm" active={active} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2">
        <div className="flex gap-1.5">
          <Input
            autoFocus
            value={href}
            placeholder="https://"
            onChange={(e) => {
              setHref(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                apply();
              }
            }}
          />
          <Button size="sm" onClick={apply}>
            {href.trim() ? "Apply" : "Remove"}
          </Button>
        </div>
        {error ? <p className="mt-1.5 text-xs text-destructive">{error}</p> : null}
      </PopoverContent>
    </Popover>
  );
}

function Choice({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "rounded-md border px-2 py-1 text-xs transition-colors",
        selected
          ? "border-primary/50 bg-primary/10 text-foreground"
          : "border-border/60 text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function ExportButton({
  onExport,
}: {
  onExport: (themeId: string, size: PdfPageSize) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(PDF_THEMES[0].id);
  const [size, setSize] = useState<PdfPageSize>("A4");
  const [busy, setBusy] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs" title="Export as PDF">
          <Icon name="file-pdf" size="sm" />
          PDF
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-2.5 p-3">
        <div className="space-y-1">
          <div className="text-xs font-medium">Theme</div>
          <div className="flex flex-wrap gap-1">
            {PDF_THEMES.map((t) => (
              <Choice key={t.id} selected={t.id === theme} onSelect={() => setTheme(t.id)}>
                {t.label}
              </Choice>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-xs font-medium">Page</div>
          <div className="flex gap-1">
            {(["A4", "Letter"] as const).map((s) => (
              <Choice key={s} selected={s === size} onSelect={() => setSize(s)}>
                {s}
              </Choice>
            ))}
          </div>
        </div>
        <Button
          size="sm"
          variant="brand"
          className="w-full"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void onExport(theme, size).finally(() => {
              setBusy(false);
              setOpen(false);
            });
          }}
        >
          {busy ? "Exporting..." : "Export PDF"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export function DocumentToolbar({
  editor,
  editable,
  dirty,
  onSave,
  onExportPdf,
}: {
  editor: Editor;
  editable: boolean;
  dirty: boolean;
  onSave: () => void;
  onExportPdf: (themeId: string, size: PdfPageSize) => Promise<void>;
}) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      highlight: e.isActive("highlight"),
      link: e.isActive("link"),
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      codeBlock: e.isActive("codeBlock"),
      alignCenter: e.isActive({ textAlign: "center" }),
      alignRight: e.isActive({ textAlign: "right" }),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const off = !editable;
  const chain = () => editor.chain().focus();

  return (
    <div className="flex h-9 shrink-0 items-center border-b border-border/60 bg-card/60">
      {/* Only the formatting buttons scroll. Save and export sit outside the
          scroller, so a narrow window cannot push them out of reach. */}
      <div
        role="toolbar"
        aria-label="Formatting"
        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-2"
      >
      <ToolButton icon="undo" label="Undo" disabled={off || !s.canUndo} onClick={() => chain().undo().run()} />
      <ToolButton icon="redo" label="Redo" disabled={off || !s.canRedo} onClick={() => chain().redo().run()} />
      <Divider />
      <ToolButton icon="heading-1" label="Heading 1" active={s.h1} disabled={off} onClick={() => chain().toggleHeading({ level: 1 }).run()} />
      <ToolButton icon="heading-2" label="Heading 2" active={s.h2} disabled={off} onClick={() => chain().toggleHeading({ level: 2 }).run()} />
      <ToolButton icon="heading-3" label="Heading 3" active={s.h3} disabled={off} onClick={() => chain().toggleHeading({ level: 3 }).run()} />
      <Divider />
      <ToolButton icon="format-bold" label="Bold" active={s.bold} disabled={off} onClick={() => chain().toggleBold().run()} />
      <ToolButton icon="format-italic" label="Italic" active={s.italic} disabled={off} onClick={() => chain().toggleItalic().run()} />
      <ToolButton icon="format-underline" label="Underline" active={s.underline} disabled={off} onClick={() => chain().toggleUnderline().run()} />
      <ToolButton icon="format-strike" label="Strikethrough" active={s.strike} disabled={off} onClick={() => chain().toggleStrike().run()} />
      <ToolButton icon="format-highlight" label="Highlight" active={s.highlight} disabled={off} onClick={() => chain().toggleHighlight().run()} />
      <ToolButton icon="code" label="Inline code" active={s.code} disabled={off} onClick={() => chain().toggleCode().run()} />
      <LinkButton editor={editor} active={s.link} disabled={off} />
      <Divider />
      <ToolButton icon="list-bullet" label="Bulleted list" active={s.bullet} disabled={off} onClick={() => chain().toggleBulletList().run()} />
      <ToolButton icon="list-numbered" label="Numbered list" active={s.ordered} disabled={off} onClick={() => chain().toggleOrderedList().run()} />
      <ToolButton icon="check-box" label="Checklist" active={s.task} disabled={off} onClick={() => chain().toggleTaskList().run()} />
      <ToolButton icon="quote" label="Quote" active={s.quote} disabled={off} onClick={() => chain().toggleBlockquote().run()} />
      <ToolButton icon="code-box" label="Code block" active={s.codeBlock} disabled={off} onClick={() => chain().toggleCodeBlock().run()} />
      <ToolButton icon="table" label="Insert table" disabled={off} onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
      <ToolButton icon="minus" label="Divider" disabled={off} onClick={() => chain().setHorizontalRule().run()} />
      <Divider />
      <ToolButton icon="align-left" label="Align left" active={!s.alignCenter && !s.alignRight} disabled={off} onClick={() => chain().setTextAlign("left").run()} />
      <ToolButton icon="align-center" label="Align center" active={s.alignCenter} disabled={off} onClick={() => chain().setTextAlign("center").run()} />
      <ToolButton icon="align-right" label="Align right" active={s.alignRight} disabled={off} onClick={() => chain().setTextAlign("right").run()} />

      </div>
      <div className="flex shrink-0 items-center gap-1 border-l border-border/60 px-2">
        <ExportButton onExport={onExportPdf} />
        <Button
          variant={dirty ? "brand" : "ghost"}
          size="xs"
          title="Save (Ctrl+S)"
          disabled={off || !dirty}
          onClick={onSave}
        >
          <Icon name="save" size="sm" />
          Save
        </Button>
      </div>
    </div>
  );
}
