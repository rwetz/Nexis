// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { cn } from "@/lib/utils";
import type { DocumentTab, Tab } from "@/modules/tabs";
import { DocumentEditor } from "./DocumentEditor";

type Props = {
  tabs: Tab[];
  activeId: number;
  onDirtyChange: (id: number, dirty: boolean) => void;
  onRepoint: (id: number, path: string) => void;
  onEditRaw: (path: string) => void;
};

/**
 * Every document tab stays mounted, hidden with `invisible` rather than
 * unmounted, so switching tabs keeps unsaved edits, the undo history and the
 * scroll position. Same layout as ImageStack.
 */
export function DocumentStack({ tabs, activeId, onDirtyChange, onRepoint, onEditRaw }: Props) {
  const docs = tabs.filter((t): t is DocumentTab => t.kind === "document");
  if (docs.length === 0) return null;
  return (
    <div className="relative h-full w-full">
      {docs.map((t) => {
        const visible = t.id === activeId;
        return (
          <div
            key={t.id}
            className={cn("absolute inset-0", !visible && "invisible pointer-events-none")}
            inert={!visible}
          >
            {/* Keyed on the path: a tab re-pointed at a saved copy must load
                that file from scratch, not keep the original's import report. */}
            <DocumentEditor
              key={t.path}
              tab={t}
              visible={visible}
              onDirtyChange={onDirtyChange}
              onRepoint={onRepoint}
              onEditRaw={onEditRaw}
            />
          </div>
        );
      })}
    </div>
  );
}
