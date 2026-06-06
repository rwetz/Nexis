// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { cn } from "@/lib/utils";
import type { NotebookTab, Tab } from "@/modules/tabs";
import { NotebookViewer } from "./NotebookViewer";

type Props = {
  tabs: Tab[];
  activeId: number;
};

export function NotebookStack({ tabs, activeId }: Props) {
  const notebooks = tabs.filter((t): t is NotebookTab => t.kind === "notebook");
  if (notebooks.length === 0) return null;
  return (
    <div className="relative h-full w-full">
      {notebooks.map((t) => {
        const visible = t.id === activeId;
        return (
          <div
            key={t.id}
            className={cn("absolute inset-0", !visible && "invisible pointer-events-none")}
            aria-hidden={!visible}
          >
            <NotebookViewer path={t.path} visible={visible} />
          </div>
        );
      })}
    </div>
  );
}
