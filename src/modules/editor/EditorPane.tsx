// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { redo, undo } from "@codemirror/commands";
import { foldAll, unfoldAll } from "@codemirror/language";
import {
  findNext,
  findPrevious,
  gotoLine,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import { EditorView, keymap } from "@codemirror/view";
import { formatBytes } from "@/lib/format";
import { usePreferencesStore } from "@/modules/settings/preferences";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { loadEditorTheme, getCachedEditorTheme } from "./lib/themes";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { RenameDialog } from "./RenameDialog";
import { CodeActionDialog } from "./CodeActionDialog";
import { Minimap, minimapUpdateExtension } from "./Minimap";
import type { LspRange } from "@/modules/lsp/protocol";
import { useChatStore } from "@/modules/ai/store/chatStore";
import { Compartment, EditorSelection, Prec } from "@codemirror/state";
import { vim } from "@replit/codemirror-vim";
import {
  buildSharedExtensions,
  languageCompartment,
  vimCompartment,
  wrapCompartment,
} from "./lib/extensions";
import { initVimGlobals, vimHandlersExtension } from "./lib/vim";
import {
  createLspCompartment,
  lspSeedExtension,
  activateLsp,
  type LspHandle,
} from "@/modules/lsp/lspExtension";
import {
  breakpointGutter,
  breakpointField,
  currentLineField,
  syncBreakpointsToView,
  setCurrentLine,
} from "@/modules/debugger/extensions/breakpointGutter";
import { useBreakpointStore } from "@/modules/debugger/breakpointStore";
import { useDebugStore } from "@/modules/debugger/debugSession";

initVimGlobals();
import { resolveLanguage } from "./lib/languageResolver";
import { useLanguageOverrides } from "./lib/languageOverrides";
import { useDocument } from "./lib/useDocument";
import { formatFile } from "./lib/formatter";
import { inlineCompletion } from "./lib/autocomplete/inlineExtension";
import { syntaxLinter } from "./lib/linting";
import { tryExpandSnippet } from "./lib/snippetExpansion";
import { useCodeSnippetsStore } from "@/modules/snippets/codeSnippetsStore";
import { getKey } from "@/modules/ai/lib/keyring";
import { onKeysChanged } from "@/modules/settings/store";

export type EditorPaneHandle = {
  setQuery: (q: string) => void;
  findNext: () => void;
  findPrevious: () => void;
  clearQuery: () => void;
  focus: () => void;
  getSelection: () => string | null;
  getPath: () => string;
  /** Return the 1-based line number of the primary cursor, or 0 if no view. */
  getCursorLine: () => number;
  /** Re-read the file from disk. Skips silently if the buffer is dirty. */
  reload: () => boolean;
  /** Force re-read from disk even if dirty. Used after formatting. */
  reloadForce: () => void;
  /** Flush pending edits to disk. No-op if not dirty. */
  save: () => Promise<void>;
  /** Save then run the configured formatter, reloading on success. */
  format: () => Promise<{ ok: boolean; error?: string }>;
  /** Apply CodeMirror's undo/redo commands. */
  undo: () => void;
  redo: () => void;
  /** Open the LSP code-action (refactor) dialog for the current selection. */
  openCodeActions: () => void;
  /** Open CodeMirror's go-to-line panel. */
  openGotoLine: () => void;
};

type Props = {
  path: string;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: () => void;
  onClose?: () => void;
};

/**
 * Large-file mode: above this size the pane opens with the heavy language
 * tooling off — LSP, lint, folding, minimap, AI completion — and a banner
 * offering to enable it anyway. The buffer itself still opens (CodeMirror
 * handles multi-MB documents fine; it's the tooling churn that doesn't).
 * Distinct from the hard fs_read_file cap, which refuses to open at all.
 */
export const LARGE_FILE_BYTES = 2 * 1024 * 1024;

/** Paths where the user clicked "Enable anyway" — remembered for the session
 * so switching tabs doesn't re-disable tooling they explicitly asked for. */
const largeFileOverrides = new Set<string>();

/** Lint on/off switch for large-file mode. Compartments are reusable keys —
 * each editor state tracks its own configuration for it. */
const lintCompartment = new Compartment();

function deriveProjectHints(filePath: string): string[] {
  const hints: string[] = [];
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  if (/\.(ts|tsx)$/.test(normalized)) hints.push("TypeScript");
  if (/\.tsx$/.test(normalized) || normalized.includes("/components/") || normalized.includes("/pages/")) hints.push("React");
  if (/\.rs$/.test(normalized)) hints.push("Rust");
  if (normalized.includes("tauri") || normalized.includes("src-tauri")) hints.push("Tauri");
  if (/\.(py|pyw)$/.test(normalized)) hints.push("Python");
  if (/\.go$/.test(normalized)) hints.push("Go");
  if (/\.(jsx?|tsx?)$/.test(normalized) && normalized.includes("node_modules")) hints.push("Node.js");
  if (/\.(css|scss|sass|less)$/.test(normalized)) hints.push("CSS");
  return hints;
}

export const EditorPane = forwardRef<EditorPaneHandle, Props>(
  function EditorPane({ path, onDirtyChange, onSaved, onClose }, ref) {
    const { doc, onChange, save, reload, reloadForce, applyRecovery, discardRecovery } =
      useDocument({ path, onDirtyChange });
    const reloadRef = useRef(reload);
    reloadRef.current = reload;
    const reloadForceRef = useRef(reloadForce);
    reloadForceRef.current = reloadForce;
    const cmRef = useRef<ReactCodeMirrorRef>(null);
    const editorThemeId = usePreferencesStore((s) => s.editorTheme);
    const vimMode = usePreferencesStore((s) => s.vimMode);
    const wordWrap = usePreferencesStore((s) => s.wordWrap);
    const languageRef = useRef<string | null>(null);
    const apiKeyRef = useRef<string | null>(null);

    // LSP — one stable Compartment per editor pane instance
    const lspCompartmentRef = useRef(createLspCompartment());
    const lspHandleRef = useRef<LspHandle | null>(null);

    useEffect(() => {
      let cancelled = false;
      const refresh = async () => {
        const provider = usePreferencesStore.getState().autocompleteProvider;
        if (provider === "lmstudio" || provider === "mlx" || provider === "ollama") {
          apiKeyRef.current = null;
          return;
        }
        const k = await getKey(provider);
        if (!cancelled) apiKeyRef.current = k;
      };
      void refresh();
      let unlistenKeys: (() => void) | undefined;
      void onKeysChanged(() => void refresh()).then((un) => {
        unlistenKeys = un;
      });
      const unsubPrefs = usePreferencesStore.subscribe((state, prev) => {
        if (state.autocompleteProvider !== prev.autocompleteProvider) {
          void refresh();
        }
      });
      return () => {
        cancelled = true;
        unlistenKeys?.();
        unsubPrefs();
      };
    }, []);
    const [themeExt, setThemeExt] = useState(() => getCachedEditorTheme(editorThemeId));
    useEffect(() => {
      let cancelled = false;
      void loadEditorTheme(editorThemeId).then((ext) => { if (!cancelled) setThemeExt(ext); });
      return () => { cancelled = true; };
    }, [editorThemeId]);

    // Stabilize save + onSaved via refs so the extensions array never changes
    // identity — a new identity makes @uiw/react-codemirror reconfigure the
    // whole state, wiping the language compartment.
    const saveRef = useRef(save);
    saveRef.current = save;
    const onSavedRef = useRef(onSaved);
    onSavedRef.current = onSaved;
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    const pathRef = useRef(path);
    pathRef.current = path;

    const [renameTarget, setRenameTarget] = useState<{
      symbol: string;
      line: number;
      character: number;
    } | null>(null);
    const openRenameRef = useRef<
      | ((target: { symbol: string; line: number; character: number }) => void)
      | null
    >(null);
    openRenameRef.current = (target) => setRenameTarget(target);

    const [codeActionRange, setCodeActionRange] = useState<LspRange | null>(null);
    const openCodeActionRef = useRef<((range: LspRange) => void) | null>(null);
    openCodeActionRef.current = (range) => setCodeActionRange(range);

    const [editorView, setEditorView] = useState<EditorView | undefined>(undefined);

    // Large-file mode — recomputed when the document (re)loads. The ref
    // mirrors the state for the stable extensions array (AI completion reads
    // it per keystroke; the array itself must never change identity).
    const [toolingDisabled, setToolingDisabled] = useState(false);
    const toolingDisabledRef = useRef(false);
    toolingDisabledRef.current = toolingDisabled;
    const docReady = doc.status === "ready";
    const docSize = doc.status === "ready" ? doc.size : 0;
    useEffect(() => {
      setToolingDisabled(
        docReady && docSize > LARGE_FILE_BYTES && !largeFileOverrides.has(path),
      );
    }, [docReady, docSize, path]);

    // Lint follows the mode via its compartment: the extensions array stays
    // identity-stable, only the compartment's contents change.
    useEffect(() => {
      const view = cmRef.current?.view;
      if (!view) return;
      view.dispatch({
        effects: lintCompartment.reconfigure(
          toolingDisabled ? [] : syntaxLinter(),
        ),
      });
    }, [toolingDisabled, editorView]);

    const projectHintsRef = useRef<string[] | null>(null);
    useEffect(() => {
      projectHintsRef.current = deriveProjectHints(path);
    }, [path]);

    // Reactive workspace root: `live` starts as a NOOP (root = null) and is
    // re-registered by App once explorerRoot/launchCwd/home hydrate. Restored
    // tabs mount before that, so activateLsp must re-run when the root
    // appears — a one-shot check here left LSP permanently dead after an app
    // reload (no diagnostics, empty Problems counts). Selector returns a
    // primitive, so it's pitfall-#14 safe.
    const workspaceRoot = useChatStore((s) => s.live.getWorkspaceRoot());

    // Activate LSP when the editor view is ready and a file is loaded.
    // Large-file mode holds it off; "Enable anyway" flips toolingDisabled and
    // re-runs this effect, activating LSP on the spot.
    useEffect(() => {
      if (!editorView || doc.status !== "ready" || !workspaceRoot) return;
      if (toolingDisabled) return;
      const readyDoc = doc as { status: "ready"; content: string; size: number };
      let cancelled = false;
      void activateLsp(editorView, lspCompartmentRef.current, {
        getPath: () => pathRef.current,
        getWorkspaceRoot: () => useChatStore.getState().live.getWorkspaceRoot() ?? null,
        navigateTo: (targetPath, line, _ch) => {
          // Emit a custom event; tab manager listens for this
          window.dispatchEvent(
            new CustomEvent("nexis:open-file", { detail: { path: targetPath, line } }),
          );
        },
      }, readyDoc.content).then((handle) => {
        if (cancelled) {
          handle?.close();
          return;
        }
        lspHandleRef.current = handle;
      });

      return () => {
        cancelled = true;
        lspHandleRef.current?.close();
        lspHandleRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editorView, path, doc.status === "ready", workspaceRoot, toolingDisabled]);

    // Notify LSP on content changes
    const onChangeWithLsp = (value: string) => {
      onChange(value);
      lspHandleRef.current?.notifyChange(value);
    };

    // Navigate to a specific line+character when a "nexis:goto-location" event fires.
    // Fired by the Problems panel (and potentially other features) after opening a file.
    useEffect(() => {
      const handler = (e: Event) => {
        const ev = e as CustomEvent<{ path: string; line: number; character: number }>;
        if (!editorView) return;
        // Normalize paths: backslash vs forward slash
        const evPath = ev.detail.path.replace(/\\/g, "/");
        const myPath = path.replace(/\\/g, "/");
        if (evPath !== myPath) return;
        const { line, character } = ev.detail;
        const lineInfo = editorView.state.doc.line(
          Math.max(1, Math.min(line + 1, editorView.state.doc.lines)),
        );
        const pos = Math.min(lineInfo.from + character, lineInfo.to);
        editorView.dispatch({
          selection: EditorSelection.cursor(pos),
          effects: EditorView.scrollIntoView(pos, { y: "center" }),
        });
        editorView.focus();
      };
      window.addEventListener("nexis:goto-location", handler);
      return () => window.removeEventListener("nexis:goto-location", handler);
    }, [editorView, path]);

    // Force-reload when a workspace edit (LSP rename / refactor) rewrote this
    // file on disk. Fired by notifyFilesRewritten — without this, only the
    // active tab reloads and hidden tabs go stale until FS sync catches up.
    useEffect(() => {
      const myPath = path.replace(/\\/g, "/").toLowerCase();
      const handler = (e: Event) => {
        const ev = e as CustomEvent<{ paths: string[] }>;
        const hit = ev.detail.paths.some(
          (p) => p.replace(/\\/g, "/").toLowerCase() === myPath,
        );
        if (hit) reloadForceRef.current();
      };
      window.addEventListener("nexis:files-rewritten", handler);
      return () => window.removeEventListener("nexis:files-rewritten", handler);
    }, [path]);

    // Breakpoints — sync store → gutter when path changes or store updates
    const toggleBreakpoint = useBreakpointStore((s) => s.toggleBreakpoint);
    // Select the stable store array — `breakpointsForPath()` returns a fresh
    // array on every call, which (in the effect deps) re-ran the sync on every
    // render. Derive the per-path lines in a memo keyed on the raw array.
    const allBreakpoints = useBreakpointStore((s) => s.breakpoints);
    const breakpointLines = useMemo(
      () =>
        allBreakpoints
          .filter((b) => b.path === path && b.enabled)
          .map((b) => b.line),
      [allBreakpoints, path],
    );

    useEffect(() => {
      if (!editorView) return;
      syncBreakpointsToView(editorView, path, breakpointLines);
    }, [editorView, path, breakpointLines]);

    // Sync current execution line to this pane
    const currentDebugPath = useDebugStore((s) => s.currentPath);
    const currentDebugLine = useDebugStore((s) => s.currentLine);
    useEffect(() => {
      if (!editorView) return;
      if (currentDebugPath === path && currentDebugLine != null) {
        setCurrentLine(editorView, currentDebugLine);
      } else {
        setCurrentLine(editorView, null);
      }
    }, [editorView, path, currentDebugPath, currentDebugLine]);

    const extensions = useMemo(
      () => [
        // basicSetup is added before user extensions by @uiw/react-codemirror,
        // so we must elevate vim's precedence to win the keymap.
        vimCompartment.of(
          usePreferencesStore.getState().vimMode ? Prec.highest(vim()) : [],
        ),
        wrapCompartment.of(
          usePreferencesStore.getState().wordWrap ? EditorView.lineWrapping : [],
        ),
        vimHandlersExtension(() => ({
          save: () => {
            void (async () => {
              await saveRef.current();
              onSavedRef.current?.();
            })();
          },
          close: () => onCloseRef.current?.(),
        })),
        ...buildSharedExtensions(),
        // Pushes doc/geometry changes to the mounted Minimap (module-level
        // const, so the extensions array keeps its stable identity).
        minimapUpdateExtension,
        lintCompartment.of(syntaxLinter()),
        // LSP seed (filled by activateLsp when view is ready)
        lspSeedExtension(lspCompartmentRef.current),
        // Breakpoint gutter
        breakpointField,
        currentLineField,
        breakpointGutter(
          (togglePath, line) => toggleBreakpoint(togglePath, line),
          () => pathRef.current,
        ),
        languageCompartment.of([]),
        inlineCompletion({
          getPrefs: () => {
            const s = usePreferencesStore.getState();
            const p = s.autocompleteProvider;
            const modelId =
              p === "lmstudio"
                ? s.lmstudioModelId
                : p === "mlx"
                  ? s.mlxModelId
                  : p === "ollama"
                    ? s.ollamaModelId
                    : p === "openai-compatible"
                      ? s.openaiCompatibleModelId
                      : s.autocompleteModelId;
            return {
              enabled: s.autocompleteEnabled && !toolingDisabledRef.current,
              provider: p,
              modelId,
              apiKey: apiKeyRef.current,
              lmstudioBaseURL: s.lmstudioBaseURL,
              mlxBaseURL: s.mlxBaseURL,
              ollamaBaseURL: s.ollamaBaseURL,
              vllmBaseURL: s.vllmBaseURL,
              xllmBaseURL: s.xllmBaseURL,
              sglangBaseURL: s.sglangBaseURL,
              openaiCompatibleBaseURL: s.openaiCompatibleBaseURL,
            };
          },
          getPath: () => pathRef.current,
          getLanguage: () => languageRef.current,
          getProjectHints: () => projectHintsRef.current,
        }),
        keymap.of([
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              void (async () => {
                await saveRef.current();
                onSavedRef.current?.();
                if (usePreferencesStore.getState().formatOnSave) {
                  const s = usePreferencesStore.getState();
                  const result = await formatFile(pathRef.current, s.formatters);
                  if (result.ok) reloadForceRef.current();
                }
              })();
              return true;
            },
          },
          {
            key: "Tab",
            run: (view) => {
              const snippets = useCodeSnippetsStore.getState().snippets;
              return tryExpandSnippet(view, snippets, languageRef.current);
            },
          },
          { key: "Ctrl-k Ctrl-0", mac: "Cmd-k Cmd-0", run: foldAll, preventDefault: true },
          { key: "Ctrl-k Ctrl-j", mac: "Cmd-k Cmd-j", run: unfoldAll, preventDefault: true },
          {
            key: "F2",
            run: (view) => {
              const cursor = view.state.selection.main.head;
              const word = view.state.wordAt(cursor);
              if (!word) return false;
              const symbol = view.state.sliceDoc(word.from, word.to);
              if (!symbol.trim()) return false;
              const lineInfo = view.state.doc.lineAt(word.from);
              openRenameRef.current?.({
                symbol,
                line: lineInfo.number - 1,
                character: word.from - lineInfo.from,
              });
              return true;
            },
          },
        ]),
      ],
      [],
    );

    useEffect(() => {
      const view = cmRef.current?.view;
      if (!view) return;
      view.dispatch({
        effects: vimCompartment.reconfigure(
          vimMode ? Prec.highest(vim()) : [],
        ),
      });
    }, [vimMode]);

    useEffect(() => {
      const view = cmRef.current?.view;
      if (!view) return;
      view.dispatch({
        effects: wrapCompartment.reconfigure(
          wordWrap ? EditorView.lineWrapping : [],
        ),
      });
    }, [wordWrap]);

    const languageOverride = useLanguageOverrides(
      (s) => s.overrides[path] ?? null,
    );
    useEffect(() => {
      let cancelled = false;
      const ext = path.split(".").pop()?.toLowerCase() ?? null;
      languageRef.current = languageOverride ?? ext;
      resolveLanguage(path, languageOverride).then((ext) => {
        if (cancelled) return;
        const view = cmRef.current?.view;
        if (!view) return;
        view.dispatch({
          effects: languageCompartment.reconfigure(ext ?? []),
        });
      });
      return () => {
        cancelled = true;
      };
    }, [path, doc.status, languageOverride]);

    useImperativeHandle(
      ref,
      () => ({
        setQuery: (q: string) => {
          const view = cmRef.current?.view;
          if (!view) return;
          view.dispatch({
            effects: setSearchQuery.of(
              new SearchQuery({ search: q, caseSensitive: false }),
            ),
          });
          if (q) findNext(view);
        },
        findNext: () => {
          const view = cmRef.current?.view;
          if (view) findNext(view);
        },
        findPrevious: () => {
          const view = cmRef.current?.view;
          if (view) findPrevious(view);
        },
        clearQuery: () => {
          const view = cmRef.current?.view;
          if (!view) return;
          view.dispatch({
            effects: setSearchQuery.of(new SearchQuery({ search: "" })),
          });
        },
        focus: () => {
          cmRef.current?.view?.focus();
        },
        getSelection: () => {
          const view = cmRef.current?.view;
          if (!view) return null;
          const { from, to } = view.state.selection.main;
          if (from === to) return null;
          return view.state.sliceDoc(from, to);
        },
        getPath: () => path,
        getCursorLine: () => {
          const view = cmRef.current?.view;
          if (!view) return 0;
          const pos = view.state.selection.main.head;
          return view.state.doc.lineAt(pos).number;
        },
        reload: () => reloadRef.current(),
        reloadForce: () => reloadForceRef.current(),
        save: () => saveRef.current(),
        format: async () => {
          await saveRef.current();
          const s = usePreferencesStore.getState();
          const result = await formatFile(pathRef.current, s.formatters);
          if (result.ok) reloadForceRef.current();
          return result;
        },
        undo: () => {
          const view = cmRef.current?.view;
          if (view) undo(view);
        },
        redo: () => {
          const view = cmRef.current?.view;
          if (view) redo(view);
        },
        openCodeActions: () => {
          const view = cmRef.current?.view;
          if (!view) return;
          const { from, to } = view.state.selection.main;
          const fromLine = view.state.doc.lineAt(from);
          const toLine = view.state.doc.lineAt(to);
          const range: LspRange = {
            start: {
              line: fromLine.number - 1,
              character: from - fromLine.from,
            },
            end: { line: toLine.number - 1, character: to - toLine.from },
          };
          // Flush the buffer first: applyWorkspaceEdit writes to disk, so
          // the server's edit must be computed against saved content.
          void (async () => {
            await saveRef.current();
            openCodeActionRef.current?.(range);
          })();
        },
        openGotoLine: () => {
          const view = cmRef.current?.view;
          if (view) gotoLine(view);
        },
      }),
      [path],
    );

    if (doc.status === "loading") {
      return (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          Loading…
        </div>
      );
    }
    if (doc.status === "error") {
      return (
        <div className="flex h-full items-center justify-center px-6 text-center text-xs text-destructive">
          {doc.message}
        </div>
      );
    }
    if (doc.status === "binary") {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
          <div className="text-sm text-foreground">Binary file</div>
          <div className="text-xs text-muted-foreground">
            {formatBytes(doc.size)} · preview not supported
          </div>
        </div>
      );
    }
    if (doc.status === "toolarge") {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
          <div className="text-sm text-foreground">File too large</div>
          <div className="text-xs text-muted-foreground">
            {formatBytes(doc.size)} exceeds the {formatBytes(doc.limit)} limit.
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full min-h-0 flex-col">
        {doc.recovered !== null && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
            <span>
              Unsaved changes from a previous session were recovered for this
              file.
            </span>
            <span className="flex shrink-0 gap-1.5">
              <button
                type="button"
                className="rounded border border-border px-2 py-0.5 hover:bg-accent hover:text-accent-foreground"
                onClick={applyRecovery}
              >
                Restore
              </button>
              <button
                type="button"
                className="rounded border border-border px-2 py-0.5 hover:bg-accent hover:text-accent-foreground"
                onClick={discardRecovery}
              >
                Discard
              </button>
            </span>
          </div>
        )}
        {toolingDisabled && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
            <span>
              Large file ({formatBytes(doc.size)}) — language server, linting,
              folding, minimap, and AI completion are off for performance.
            </span>
            <button
              type="button"
              className="shrink-0 rounded border border-border px-2 py-0.5 hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                largeFileOverrides.add(path);
                setToolingDisabled(false);
              }}
            >
              Enable anyway
            </button>
          </div>
        )}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <CodeMirror
            ref={cmRef}
            value={doc.content}
            onChange={onChangeWithLsp}
            theme={themeExt ?? "dark"}
            extensions={extensions}
            onCreateEditor={(view) => setEditorView(view)}
            height="100%"
            className="flex-1 min-h-0 overflow-hidden"
            basicSetup={{
              lineNumbers: true,
              highlightActiveLineGutter: true,
              foldGutter: !toolingDisabled,
              bracketMatching: true,
              closeBrackets: true,
              autocompletion: true,
              highlightActiveLine: true,
              highlightSelectionMatches: true,
              searchKeymap: true,
            }}
          />
          {!toolingDisabled && <Minimap view={editorView} />}
        </div>
        {codeActionRange && workspaceRoot && (
          <CodeActionDialog
            filePath={path}
            workspaceRoot={workspaceRoot}
            range={codeActionRange}
            onClose={() => setCodeActionRange(null)}
            onApplied={() => {
              reloadForceRef.current();
              setCodeActionRange(null);
            }}
          />
        )}
        {renameTarget && workspaceRoot && (
          <RenameDialog
            symbol={renameTarget.symbol}
            filePath={path}
            line={renameTarget.line}
            character={renameTarget.character}
            workspaceRoot={workspaceRoot}
            onClose={() => setRenameTarget(null)}
            onApplied={(_old, _new) => {
              reloadForceRef.current();
              setRenameTarget(null);
            }}
          />
        )}
      </div>
    );
  },
);
