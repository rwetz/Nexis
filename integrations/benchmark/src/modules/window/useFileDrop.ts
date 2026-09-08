import { useEffect, useState } from "react";
import { IS_TAURI } from "@/lib/platform";
import { scanModels } from "@/lib/api";
import { useBenchStore } from "@/store/useBenchStore";

/**
 * Wires native file-drop. In Tauri, listens to the webview drag-drop events and
 * resolves dropped .onnx/.gguf paths into models. Returns whether a drag is
 * currently hovering so the UI can show a drop affordance.
 */
export function useFileDrop(): { dragging: boolean } {
  const [dragging, setDragging] = useState(false);
  const addModels = useBenchStore((s) => s.addModels);

  useEffect(() => {
    if (!IS_TAURI) return;
    let unlisten: (() => void) | undefined;

    void import("@tauri-apps/api/webview").then(({ getCurrentWebview }) => {
      void getCurrentWebview()
        .onDragDropEvent(async (event) => {
          const t = event.payload.type;
          if (t === "enter" || t === "over") {
            setDragging(true);
          } else if (t === "leave") {
            setDragging(false);
          } else if (t === "drop") {
            setDragging(false);
            const paths = event.payload.paths.filter((p) =>
              /\.(onnx|gguf)$/i.test(p),
            );
            if (paths.length) {
              const models = await scanModels(paths);
              addModels(models);
            }
          }
        })
        .then((un) => {
          unlisten = un;
        });
    });

    return () => unlisten?.();
  }, [addModels]);

  return { dragging };
}
