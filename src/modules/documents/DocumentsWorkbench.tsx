// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The Documents window: the workspace's documents down the left, the rich
 * editor filling the rest.
 *
 * It used to be a tab in the main window, which held only the list, capped at
 * a reading width in the middle of a wide pane; opening a row then left for
 * a second tab. A window of its own is a writing room, so the list and what
 * you are writing sit side by side here. Documents opened elsewhere (a .docx
 * from the explorer) still open as main-window tabs.
 *
 * Open documents stay mounted behind the strip, like DocumentStack does for
 * tabs, so switching keeps unsaved edits, undo history and scroll position.
 */

import { useCallback, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PanelEmptyGlyph, PanelEmptyState } from "@/components/ui/PanelEmptyState";
import { basename } from "@/lib/path";
import { cn } from "@/lib/utils";
import type { DocumentFormat, DocumentTab } from "@/modules/tabs";
import { DocumentStack } from "./DocumentStack";
import { DocumentsPanel } from "./DocumentsPanel";

type Props = {
  workspaceRoot: string | null;
  /** "Edit source" for a markdown file: the code editor lives in the main window. */
  onEditRaw: (path: string) => void;
};

/** The open documents, as a small ordered set with one in front. Kept as one
 * state object so opening and closing change the list and the front document
 * in a single, side-effect-free update. */
export function useOpenDocuments() {
  const [state, setState] = useState<{ docs: DocumentTab[]; activeId: number | null }>({
    docs: [],
    activeId: null,
  });
  const nextId = useRef(1);

  const open = useCallback((path: string, format: DocumentFormat) => {
    // Allocated outside the updater: StrictMode runs updaters twice.
    const id = nextId.current++;
    setState((prev) => {
      const existing = prev.docs.find((d) => d.path === path);
      if (existing) return { ...prev, activeId: existing.id };
      return {
        docs: [...prev.docs, { id, kind: "document", title: basename(path), path, format }],
        activeId: id,
      };
    });
  }, []);

  const close = useCallback((id: number) => {
    setState((prev) => {
      const index = prev.docs.findIndex((d) => d.id === id);
      if (index === -1) return prev;
      const docs = prev.docs.filter((d) => d.id !== id);
      // Focus the neighbour the eye lands on: the one that slides into place.
      const activeId =
        prev.activeId === id ? (docs[Math.min(index, docs.length - 1)]?.id ?? null) : prev.activeId;
      return { docs, activeId };
    });
  }, []);

  const setActiveId = useCallback((activeId: number) => {
    setState((prev) => ({ ...prev, activeId }));
  }, []);

  const update = useCallback((id: number, patch: Partial<DocumentTab>) => {
    setState((prev) => ({ ...prev, docs: prev.docs.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
  }, []);

  const setDirty = useCallback((id: number, dirty: boolean) => update(id, { dirty }), [update]);
  const repoint = useCallback(
    (id: number, path: string) => update(id, { path, title: basename(path) }),
    [update],
  );

  return { docs: state.docs, activeId: state.activeId, setActiveId, open, close, setDirty, repoint };
}
export function DocumentsWorkbench({ workspaceRoot, onEditRaw }: Props) {
  const { docs, activeId, setActiveId, open, close, setDirty, repoint } = useOpenDocuments();
  const [confirmClose, setConfirmClose] = useState<DocumentTab | null>(null);
  const active = docs.find((d) => d.id === activeId) ?? null;

  const requestClose = (doc: DocumentTab) => {
    if (doc.dirty) setConfirmClose(doc);
    else close(doc.id);
  };

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-72 shrink-0 border-r border-border/50 bg-card/40">
        <DocumentsPanel workspaceRoot={workspaceRoot} onOpenDocument={open} activePath={active?.path ?? null} />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {docs.length > 0 ? (
          <div role="tablist" aria-label="Open documents" className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border/50 px-2 py-1">
            {docs.map((doc) => (
              <div
                key={doc.id}
                className={cn(
                  "group flex shrink-0 items-center rounded-md transition-colors",
                  doc.id === activeId ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={doc.id === activeId}
                  title={doc.path}
                  onClick={() => setActiveId(doc.id)}
                  className="flex items-center gap-1.5 py-1 pr-1 pl-2 text-[11.5px] focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                >
                  <Icon name={doc.format === "docx" ? "document" : "file-edit"} size="xs" className={doc.id === activeId ? "text-primary" : undefined} />
                  <span className="max-w-48 truncate">{doc.title}</span>
                  {doc.dirty ? <span aria-label="Unsaved changes" className="size-1.5 rounded-full bg-primary" /> : null}
                </button>
                <button
                  type="button"
                  aria-label={`Close ${doc.title}`}
                  title="Close"
                  onClick={() => requestClose(doc)}
                  className="mr-1 rounded p-0.5 opacity-60 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                >
                  <Icon name="close" size="xs" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="relative min-h-0 flex-1">
          {docs.length === 0 ? (
            <PanelEmptyState
              art={<PanelEmptyGlyph icon="document" />}
              title="Pick a document"
              description="Choose one from the list, or start a new Markdown or Word file."
            />
          ) : (
            <DocumentStack
              tabs={docs}
              activeId={activeId ?? -1}
              onDirtyChange={setDirty}
              onRepoint={repoint}
              onEditRaw={onEditRaw}
            />
          )}
        </div>
      </section>

      <AlertDialog open={confirmClose !== null} onOpenChange={(o) => !o && setConfirmClose(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close without saving?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmClose ? `"${confirmClose.title}" has changes that are not saved. Closing it loses them.` : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (confirmClose) close(confirmClose.id);
                setConfirmClose(null);
              }}
            >
              Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
