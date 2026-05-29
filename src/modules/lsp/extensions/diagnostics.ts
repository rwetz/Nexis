import {
  setDiagnostics,
  type Diagnostic as CmDiagnostic,
} from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";
import type { LspDiagnostic } from "../protocol";
import { lspSeverityToCm } from "../protocol";

/** Convert an LSP offset position to a CodeMirror absolute offset. */
function lspPosToOffset(
  doc: { line(n: number): { from: number; to: number; length: number } },
  line: number,
  character: number,
): number {
  const lineInfo = doc.line(line + 1); // LSP is 0-based, CM is 1-based
  return Math.min(lineInfo.from + character, lineInfo.to);
}

/** Apply a fresh set of LSP diagnostics to a CodeMirror view. */
export function applyLspDiagnostics(
  view: EditorView,
  diags: LspDiagnostic[],
): void {
  const doc = view.state.doc;
  const cmDiags: CmDiagnostic[] = [];

  for (const d of diags) {
    try {
      const from = lspPosToOffset(doc, d.range.start.line, d.range.start.character);
      const to = lspPosToOffset(doc, d.range.end.line, d.range.end.character);
      if (from > to || from < 0 || to > doc.length) continue;

      cmDiags.push({
        from,
        to: to === from ? Math.min(from + 1, doc.length) : to,
        severity: lspSeverityToCm(d.severity),
        message: d.message,
        source: d.source,
      });
    } catch {
      // Ignore diagnostics for positions outside the current doc
    }
  }

  view.dispatch(setDiagnostics(view.state, cmDiags));
}
