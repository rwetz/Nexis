import type { Extension } from "@codemirror/state";
import { Compartment } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { autocompletion } from "@codemirror/autocomplete";
import { lintGutter } from "@codemirror/lint";
import { applyLspDiagnostics } from "./extensions/diagnostics";
import { buildCompletionResult, wordStartBefore } from "./extensions/completion";
import { lspHoverExtension } from "./extensions/hover";
import { lspDefinitionExtension } from "./extensions/definition";
import { lspClient } from "./client";
import { languageIdForPath } from "./languages";
import { pathToUri, uriToPath } from "./protocol";
import { useDiagnosticsStore } from "@/modules/problems/diagnosticsStore";

// Import type only so we can re-export it
type _SessionEntry = Awaited<ReturnType<typeof lspClient.getOrCreateSession>>;
export type SessionEntry = NonNullable<_SessionEntry>;

/** Handle returned by activateLsp — call these to feed changes + cleanup. */
export type LspHandle = {
  notifyChange: (content: string) => void;
  close: () => void;
};

type LspExtensionOpts = {
  getPath: () => string;
  getWorkspaceRoot: () => string | null;
  navigateTo: (path: string, line: number, character: number) => void;
};

/**
 * Create a standalone LSP compartment.  Call this once per editor pane
 * (outside of useMemo so the compartment identity is stable).
 */
export function createLspCompartment(): Compartment {
  return new Compartment();
}

/**
 * The seed extension to include in the editor's extension list.
 * It starts empty; activateLsp will fill it.
 */
export function lspSeedExtension(compartment: Compartment): Extension {
  return compartment.of([]);
}

/**
 * Activate LSP for an open file.  Populates the compartment with hover,
 * completion, definition, and diagnostics extensions.
 * Returns a handle or null when no server is available for the language.
 */
export async function activateLsp(
  view: EditorView,
  compartment: Compartment,
  opts: LspExtensionOpts,
  initialContent: string,
): Promise<LspHandle | null> {
  const path = opts.getPath();
  const workspaceRoot = opts.getWorkspaceRoot();
  if (!workspaceRoot) return null;

  const languageId = languageIdForPath(path);
  if (!languageId) return null;

  const entry = await lspClient.getOrCreateSession(languageId, workspaceRoot);
  if (!entry) return null;

  await lspClient.openDocument(entry, path, initialContent, languageId);

  const docUri = pathToUri(path);
  const removeDiagnosticsListener = lspClient.onDiagnostics(
    entry,
    (uri, diags) => {
      // Push to global Problems panel store (all files, not just the open one)
      const filePath = uriToPath(uri);
      useDiagnosticsStore.getState().setFileDiagnostics(filePath, diags);

      // Also apply inline to the editor view if this is the open file
      if (uri !== docUri) return;
      if (!view.dom.isConnected) return;
      applyLspDiagnostics(view, diags);
    },
  );

  const completionSource = async (
    ctx: CompletionContext,
  ): Promise<CompletionResult | null> => {
    const pos = ctx.pos;
    const wordStart = wordStartBefore(ctx);
    const lineInfo = ctx.state.doc.lineAt(pos);
    const lspLine = lineInfo.number - 1;
    const lspChar = pos - lineInfo.from;
    const items = await lspClient.completion(entry, path, lspLine, lspChar);
    return buildCompletionResult(items, wordStart, pos);
  };

  const extensions: Extension[] = [
    autocompletion({ override: [completionSource], icons: true }),
    lspHoverExtension(() => entry, () => path),
    lspDefinitionExtension(() => entry, () => path, opts.navigateTo),
    lintGutter(),
  ];

  if (view.dom.isConnected) {
    view.dispatch({ effects: compartment.reconfigure(extensions) });
  }

  return {
    notifyChange(newContent: string) {
      void lspClient.changeDocument(entry, path, newContent);
    },
    close() {
      removeDiagnosticsListener();
      // Clear this file's diagnostics from the global store so the Problems
      // panel doesn't keep showing errors for a file that is no longer open.
      useDiagnosticsStore.getState().clearFileDiagnostics(path);
      void lspClient.closeDocument(entry, path);
      if (view.dom.isConnected) {
        view.dispatch({ effects: compartment.reconfigure([]) });
      }
    },
  };
}
