import { cn } from "@/lib/utils";
import type { ImageTab, Tab } from "@/modules/tabs";
import { ImageViewerPane } from "./ImageViewerPane";

type Props = {
  tabs: Tab[];
  activeId: number;
};

export function ImageStack({ tabs, activeId }: Props) {
  const images = tabs.filter((t): t is ImageTab => t.kind === "image");
  if (images.length === 0) return null;
  return (
    <div className="relative h-full w-full">
      {images.map((t) => {
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
            <ImageViewerPane path={t.path} visible={visible} />
          </div>
        );
      })}
    </div>
  );
}
