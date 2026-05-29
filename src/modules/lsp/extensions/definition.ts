import { keymap } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { uriToPath } from "../client";

function offsetToLspPos(
  doc: { lineAt(offset: number): { number: number; from: number } },
  offset: number,
): { line: number; character: number } {
  const line = doc.lineAt(offset);
  return { line: line.number - 1, character: offset - line.from };
}

/**
 * Build the go-to-definition extension.
 * `navigateTo` is called with the resolved path and 0-based line number.
 */
export function lspDefinitionExtension(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getEntry: () => any | null,
  getPath: () => string,
  navigateTo: (path: string, line: number, character: number) => void,
): Extension {
  return keymap.of([
    {
      key: "F12",
      run(view) {
        const entry = getEntry();
        if (!entry) return false;
        const pos = view.state.selection.main.head;
        const lspPos = offsetToLspPos(view.state.doc, pos);
        void (async () => {
          const { lspClient } = await import("../client");
          const locs = await lspClient.definition(
            entry,
            getPath(),
            lspPos.line,
            lspPos.character,
          );
          if (!locs.length) return;
          const loc = locs[0];
          const targetPath = uriToPath(loc.uri);
          navigateTo(targetPath, loc.range.start.line, loc.range.start.character);
        })();
        return true;
      },
    },
  ]);
}
