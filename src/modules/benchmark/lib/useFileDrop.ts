// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { useEffect, useState } from "react";
import { scanModels } from "@/modules/benchmark/lib/api";
import { useBenchStore } from "@/modules/benchmark/store";

/**
 * Wires native file-drop for the model library: listens to the webview's
 * drag-drop events and resolves dropped `.onnx`/`.gguf` paths into models.
 * Returns whether a drag is currently hovering so the UI can show a drop
 * affordance.
 *
 * The webview drag-drop event is **window-wide** — Tauri has no per-element
 * target for it. In the standalone app that was free, because the whole window
 * was the benchmark. Inside Nexis the same event also reaches the explorer and
 * the editor, so this filters by extension and only claims files it recognises;
 * anything else falls through untouched. The listener is still only attached
 * while the panel is mounted, so a dropped `.onnx` does nothing surprising when
 * Benchmark is not open.
 */
export function useFileDrop(): { dragging: boolean } {
  const [dragging, setDragging] = useState(false);
  const addModels = useBenchStore((s) => s.addModels);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;

    void import("@tauri-apps/api/webview").then(({ getCurrentWebview }) => {
      void getCurrentWebview()
        .onDragDropEvent(async (event) => {
          const t = event.payload.type;
          if (t === "enter" || t === "over") {
            // Only light up if the drag actually carries something we take.
            // `paths` is present on enter/over for file drags.
            const paths = "paths" in event.payload ? event.payload.paths : [];
            if (paths.some((p) => /\.(onnx|gguf)$/i.test(p))) setDragging(true);
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
          // The panel can unmount before the listener resolves; without this
          // the handle leaks and the drop keeps firing into a dead store.
          if (disposed) un();
          else unlisten = un;
        });
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [addModels]);

  return { dragging };
}
