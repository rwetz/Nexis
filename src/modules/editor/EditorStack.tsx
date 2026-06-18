// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { cn } from "@/lib/utils";
import type { EditorTab, Tab } from "@/modules/tabs";
import { leafIds } from "@/modules/terminal/lib/panes";
import { useEffect, useRef } from "react";
import type { EditorPaneHandle } from "./EditorPane";
import {
  EditorPaneTreeView,
  type EditorLeafBundle,
} from "./EditorPaneTreeView";

type Props = {
  tabs: Tab[];
  activeId: number;
  /** Register/unregister handle by leaf id (not tab id). */
  registerHandle: (leafId: number, handle: EditorPaneHandle | null) => void;
  onDirtyChange: (leafId: number, dirty: boolean) => void;
  /** Close one file pane (collapses splits; closes the tab on the last pane). */
  onCloseLeaf: (leafId: number) => void;
  onFocusLeaf: (tabId: number, leafId: number) => void;
  onRunFile?: (path: string, cwd: string, command: string) => void;
  root?: string | null;
  onNavigateToFolder?: (folderPath: string) => void;
};

export function EditorStack({
  tabs,
  activeId,
  onDirtyChange,
  registerHandle,
  onCloseLeaf,
  onFocusLeaf,
  onRunFile,
  root,
  onNavigateToFolder,
}: Props) {
  const editors = tabs.filter((t): t is EditorTab => t.kind === "editor");

  // Ref-stable callbacks (see the original note): inline arrows change identity
  // every render and make React detach/reattach the handle ref, re-firing
  // onDirtyChange and looping the parent. Memoize per leaf id.
  const registerRef = useRef(registerHandle);
  const dirtyRef = useRef(onDirtyChange);
  const closeRef = useRef(onCloseLeaf);
  useEffect(() => {
    registerRef.current = registerHandle;
  }, [registerHandle]);
  useEffect(() => {
    dirtyRef.current = onDirtyChange;
  }, [onDirtyChange]);
  useEffect(() => {
    closeRef.current = onCloseLeaf;
  }, [onCloseLeaf]);

  const bundles = useRef(new Map<number, EditorLeafBundle>());
  const getBundle = (leafId: number): EditorLeafBundle => {
    let b = bundles.current.get(leafId);
    if (!b) {
      b = {
        setRef: (h) => registerRef.current(leafId, h),
        onDirty: (dirty) => dirtyRef.current(leafId, dirty),
        onClose: () => closeRef.current(leafId),
      };
      bundles.current.set(leafId, b);
    }
    return b;
  };

  // Drop bundle entries for closed leaves to avoid unbounded growth.
  useEffect(() => {
    const live = new Set<number>();
    for (const t of editors) for (const id of leafIds(t.paneTree)) live.add(id);
    for (const id of bundles.current.keys()) {
      if (!live.has(id)) bundles.current.delete(id);
    }
  }, [editors]);

  if (editors.length === 0) return null;
  return (
    <div className="relative h-full w-full">
      {editors.map((t) => {
        const visible = t.id === activeId;
        return (
          <div
            key={t.id}
            className={cn(
              "absolute inset-0",
              !visible && "invisible pointer-events-none",
            )}
            aria-hidden={!visible}
          >
            <EditorPaneTreeView
              node={t.paneTree}
              activeLeafId={t.activeLeafId}
              onFocusLeaf={(leafId) => onFocusLeaf(t.id, leafId)}
              getBundle={getBundle}
              root={root}
              onRunFile={onRunFile}
              onNavigateToFolder={onNavigateToFolder}
            />
          </div>
        );
      })}
    </div>
  );
}
