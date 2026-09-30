// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { cn } from "@/lib/utils";
import type { MarkdownTab, Tab } from "@/modules/tabs";
import { MarkdownPreviewPane } from "./MarkdownPreviewPane";

type Props = {
  tabs: Tab[];
  activeId: number;
  onEdit?: (path: string) => void;
};

export function MarkdownStack({ tabs, activeId, onEdit }: Props) {
  const markdowns = tabs.filter((t): t is MarkdownTab => t.kind === "markdown");
  if (markdowns.length === 0) return null;
  return (
    <div className="relative h-full w-full">
      {markdowns.map((t) => {
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
            <MarkdownPreviewPane path={t.path} visible={visible} onEdit={onEdit} />
          </div>
        );
      })}
    </div>
  );
}
