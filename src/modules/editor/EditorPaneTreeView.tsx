// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { Fragment } from "react";
import { cn } from "@/lib/utils";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setWordWrap } from "@/modules/settings/store";
import {
  Cancel01Icon,
  PlayIcon,
  TextAlignLeftIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type { EditorPaneNode } from "@/modules/tabs";
import { EditorPane, type EditorPaneHandle } from "./EditorPane";
import { EditorBreadcrumb } from "./EditorBreadcrumb";
import { buildRunCommand } from "./lib/runCommand";
import {
  LANGUAGE_CHOICES,
  PLAIN_LANGUAGE_ID,
  detectedLanguageId,
  languageLabel,
} from "./lib/languageResolver";
import { useLanguageOverrides } from "./lib/languageOverrides";

export type EditorLeafBundle = {
  setRef: (h: EditorPaneHandle | null) => void;
  onDirty: (dirty: boolean) => void;
  onClose: () => void;
};

type Props = {
  node: EditorPaneNode;
  activeLeafId: number;
  onFocusLeaf: (leafId: number) => void;
  getBundle: (leafId: number) => EditorLeafBundle;
  root?: string | null;
  onRunFile?: (path: string, cwd: string, command: string) => void;
  onNavigateToFolder?: (folderPath: string) => void;
  /** True once inside a split — gates the focus glow and per-pane close. */
  split?: boolean;
};

export function EditorPaneTreeView({
  node,
  activeLeafId,
  onFocusLeaf,
  getBundle,
  root,
  onRunFile,
  onNavigateToFolder,
  split = false,
}: Props) {
  const wordWrap = usePreferencesStore((s) => s.wordWrap);
  // Stable store reference (pitfall #14) — indexed per leaf below.
  const languageOverrides = useLanguageOverrides((s) => s.overrides);
  const setLanguageOverride = useLanguageOverrides((s) => s.setOverride);

  if (node.kind === "leaf") {
    const focused = node.id === activeLeafId;
    const b = getBundle(node.id);
    const rc = onRunFile ? buildRunCommand(node.path) : null;
    const langOverride = languageOverrides[node.path] ?? null;
    const detectedLang = detectedLanguageId(node.path);
    return (
      <div
        onMouseDownCapture={() => {
          if (!focused) onFocusLeaf(node.id);
        }}
        onFocus={() => {
          if (!focused) onFocusLeaf(node.id);
        }}
        data-editor-leaf={node.id}
        className="flex h-full w-full flex-col overflow-hidden rounded-md border border-border/60 bg-background"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border/40 bg-card/60 px-2 py-0.5">
          <EditorBreadcrumb
            path={node.path}
            root={root ?? null}
            onNavigate={onNavigateToFolder}
          />
          <div className="flex shrink-0 items-center gap-1">
            <Select
              value={langOverride ?? "auto"}
              onValueChange={(v) =>
                setLanguageOverride(node.path, v === "auto" ? null : v)
              }
            >
              <SelectTrigger
                size="sm"
                title="Syntax language for this file"
                className="h-5 gap-1 rounded border-0 bg-transparent px-1.5 text-[11px] text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
              >
                {languageLabel(langOverride ?? detectedLang)}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto" className="text-[12px]">
                  Auto ({languageLabel(detectedLang)})
                </SelectItem>
                <SelectItem value={PLAIN_LANGUAGE_ID} className="text-[12px]">
                  Plain Text
                </SelectItem>
                {LANGUAGE_CHOICES.map((c) => (
                  <SelectItem key={c.id} value={c.id} className="text-[12px]">
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              title={wordWrap ? "Disable word wrap" : "Enable word wrap"}
              onClick={() => void setWordWrap(!wordWrap)}
              className={cn(
                "flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors hover:bg-muted",
                wordWrap
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <HugeiconsIcon icon={TextAlignLeftIcon} size={12} strokeWidth={1.75} />
            </button>
            {rc && onRunFile && (
              <button
                type="button"
                title={`Run: ${rc.command.trim()}`}
                onClick={() => onRunFile(node.path, rc.cwd, rc.command)}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <HugeiconsIcon icon={PlayIcon} size={12} strokeWidth={1.75} className="text-green-500" />
                <span className="font-mono">{rc.command.trim()}</span>
              </button>
            )}
            {/* Per-pane close — only inside a split; a lone pane closes via its tab. */}
            {split && (
              <button
                type="button"
                aria-label="Close pane"
                title="Close pane"
                onClick={(e) => {
                  e.stopPropagation();
                  b.onClose();
                }}
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-red-400"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
        <div className="relative min-h-0 flex-1">
          <EditorPane
            ref={b.setRef}
            path={node.path}
            onDirtyChange={b.onDirty}
            onClose={b.onClose}
          />
          {/* Focus ring — overlay on top of the editor (see globals.css). */}
          {focused && split && (
            <div className="pane-focus-ring pointer-events-none absolute inset-0 z-30 rounded-[inherit]" />
          )}
        </div>
      </div>
    );
  }

  return (
    <ResizablePanelGroup
      orientation={node.dir === "row" ? "horizontal" : "vertical"}
    >
      {node.children.map((child, i) => (
        <Fragment key={child.id}>
          {i > 0 && <ResizableHandle />}
          <ResizablePanel id={`epane-${child.id}`} minSize="10%">
            <EditorPaneTreeView
              node={child}
              activeLeafId={activeLeafId}
              onFocusLeaf={onFocusLeaf}
              getBundle={getBundle}
              root={root}
              onRunFile={onRunFile}
              onNavigateToFolder={onNavigateToFolder}
              split
            />
          </ResizablePanel>
        </Fragment>
      ))}
    </ResizablePanelGroup>
  );
}
