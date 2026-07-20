// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { invoke } from "@tauri-apps/api/core";
import { clearMissingTool, reportMissingTool } from "@/lib/missingTools";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  type LspCodeAction,
  type LspCompletionItem,
  type LspCompletionList,
  type LspDiagnostic,
  type LspHover,
  type LspLocation,
  type LspRange,
  type LspWorkspaceEdit,
  pathToUri,
  uriToPath,
} from "./protocol";
import { serverGroupForLanguage } from "./languages";

/**
 * Servers can push edits to the client via the `workspace/applyEdit` request
 * (e.g. after `workspace/executeCommand` runs a refactoring). The Rust proxy
 * acks the request and re-emits it as an event; this single global listener
 * applies the edit to disk (which also notifies open editor tabs).
 */
let applyEditListenerStarted = false;
function ensureApplyEditListener(): void {
  if (applyEditListenerStarted) return;
  applyEditListenerStarted = true;
  void listen<{
    workspaceRoot: string;
    params: { label?: string; edit?: LspWorkspaceEdit };
  }>("lsp:workspace:applyEdit", (event) => {
    void (async () => {
      const { applyWorkspaceEdit, workspaceEditHasChanges } = await import(
        "./applyEdit"
      );
      const edit = event.payload.params?.edit ?? null;
      if (workspaceEditHasChanges(edit)) await applyWorkspaceEdit(edit);
    })();
  });
}

type SessionEntry = {
  sessionId: number;
  group: string;
  docVersions: Map<string, number>; // uri → version
  diagnosticsListeners: Set<(uri: string, diags: LspDiagnostic[]) => void>;
  unlisten?: UnlistenFn;
};

/** One LSP client per workspace root. Manages sessions per language group. */
class LspClientManager {
  private sessions = new Map<string, SessionEntry>(); // `${group}::${workspaceRoot}`
  private starting = new Map<string, Promise<number | null>>(); // prevents concurrent starts

  private sessionKey(group: string, workspaceRoot: string) {
    return `${group}::${workspaceRoot}`;
  }

  /** Get or create an LSP session for a language + workspace. Returns null if server unavailable. */
  async getOrCreateSession(
    languageId: string,
    workspaceRoot: string,
  ): Promise<SessionEntry | null> {
    const group = serverGroupForLanguage(languageId);
    if (!group) return null;

    const key = this.sessionKey(group, workspaceRoot);
    const existing = this.sessions.get(key);
    if (existing) return existing;

    // Deduplicate concurrent start attempts
    const inflight = this.starting.get(key);
    if (inflight) {
      const id = await inflight;
      return id !== null ? (this.sessions.get(key) ?? null) : null;
    }

    const p = this.startSession(group, workspaceRoot);
    this.starting.set(key, p);
    const sessionId = await p;
    this.starting.delete(key);

    return sessionId !== null ? (this.sessions.get(key) ?? null) : null;
  }

  private async startSession(
    group: string,
    workspaceRoot: string,
  ): Promise<number | null> {
    const { LANGUAGE_SERVERS } = await import("./languages");
    const serverConfig = LANGUAGE_SERVERS[group];
    if (!serverConfig) return null;

    try {
      const sessionId = await invoke<number>("lsp_start", {
        serverCmd: serverConfig.cmd,
        serverArgs: serverConfig.args,
        workspaceRoot,
        initializationOptions: serverConfig.initializationOptions ?? null,
      });

      const key = this.sessionKey(group, workspaceRoot);
      const entry: SessionEntry = {
        sessionId,
        group,
        docVersions: new Map(),
        diagnosticsListeners: new Set(),
      };

      // Listen for publishDiagnostics notifications
      const eventName = "lsp:textDocument:publishDiagnostics";
      entry.unlisten = await listen<{ workspaceRoot: string; params: { uri: string; diagnostics: LspDiagnostic[] } }>(
        eventName,
        (event) => {
          if (event.payload.workspaceRoot !== workspaceRoot) return;
          const uri = event.payload.params.uri;
          const diags = event.payload.params.diagnostics ?? [];
          for (const cb of entry.diagnosticsListeners) {
            cb(uri, diags);
          }
        },
      );

      this.sessions.set(key, entry);
      ensureApplyEditListener();
      // Installing a server mid-session should retire its notice without a
      // restart.
      clearMissingTool(group);
      return sessionId;
    } catch {
      // The server is not installed, or failed to start. Nexis deliberately
      // does not bundle language servers (binary-size budget), so this is an
      // expected state rather than an error — but it must not be *silent*:
      // completions simply never appearing, with nothing saying why, is the
      // exact failure the degradation matrix exists to end. The status bar
      // surfaces this with an install command.
      reportMissingTool(group);
      return null;
    }
  }

  async openDocument(
    entry: SessionEntry,
    path: string,
    content: string,
    languageId: string,
  ): Promise<void> {
    const uri = pathToUri(path);
    if (entry.docVersions.has(uri)) return; // already open
    entry.docVersions.set(uri, 1);
    await invoke("lsp_notify", {
      sessionId: entry.sessionId,
      method: "textDocument/didOpen",
      params: {
        textDocument: {
          uri,
          languageId,
          version: 1,
          text: content,
        },
      },
    }).catch(() => {});
  }

  async changeDocument(
    entry: SessionEntry,
    path: string,
    content: string,
  ): Promise<void> {
    const uri = pathToUri(path);
    const version = (entry.docVersions.get(uri) ?? 0) + 1;
    entry.docVersions.set(uri, version);
    await invoke("lsp_notify", {
      sessionId: entry.sessionId,
      method: "textDocument/didChange",
      params: {
        textDocument: { uri, version },
        contentChanges: [{ text: content }],
      },
    }).catch(() => {});
  }

  async closeDocument(entry: SessionEntry, path: string): Promise<void> {
    const uri = pathToUri(path);
    entry.docVersions.delete(uri);
    await invoke("lsp_notify", {
      sessionId: entry.sessionId,
      method: "textDocument/didClose",
      params: { textDocument: { uri } },
    }).catch(() => {});
  }

  async hover(
    entry: SessionEntry,
    path: string,
    line: number,
    character: number,
  ): Promise<LspHover | null> {
    try {
      const result = await invoke<LspHover | null>("lsp_request", {
        sessionId: entry.sessionId,
        method: "textDocument/hover",
        params: {
          textDocument: { uri: pathToUri(path) },
          position: { line, character },
        },
      });
      return result;
    } catch {
      return null;
    }
  }

  async completion(
    entry: SessionEntry,
    path: string,
    line: number,
    character: number,
    triggerCharacter?: string,
  ): Promise<LspCompletionItem[]> {
    try {
      const result = await invoke<LspCompletionList | LspCompletionItem[] | null>(
        "lsp_request",
        {
          sessionId: entry.sessionId,
          method: "textDocument/completion",
          params: {
            textDocument: { uri: pathToUri(path) },
            position: { line, character },
            context: triggerCharacter
              ? { triggerKind: 2, triggerCharacter }
              : { triggerKind: 1 },
          },
        },
      );
      if (!result) return [];
      if (Array.isArray(result)) return result as LspCompletionItem[];
      return (result as LspCompletionList).items;
    } catch {
      return [];
    }
  }

  async definition(
    entry: SessionEntry,
    path: string,
    line: number,
    character: number,
  ): Promise<LspLocation[]> {
    try {
      const result = await invoke<LspLocation | LspLocation[] | null>("lsp_request", {
        sessionId: entry.sessionId,
        method: "textDocument/definition",
        params: {
          textDocument: { uri: pathToUri(path) },
          position: { line, character },
        },
      });
      if (!result) return [];
      if (Array.isArray(result)) return result as LspLocation[];
      return [result as LspLocation];
    } catch {
      return [];
    }
  }

  async rename(
    entry: SessionEntry,
    path: string,
    line: number,
    character: number,
    newName: string,
  ): Promise<LspWorkspaceEdit | null> {
    try {
      return await invoke<LspWorkspaceEdit | null>("lsp_request", {
        sessionId: entry.sessionId,
        method: "textDocument/rename",
        params: {
          textDocument: { uri: pathToUri(path) },
          position: { line, character },
          newName,
        },
      });
    } catch {
      return null;
    }
  }

  async codeActions(
    entry: SessionEntry,
    path: string,
    range: LspRange,
    only?: string[],
  ): Promise<LspCodeAction[]> {
    try {
      const result = await invoke<Array<LspCodeAction | null> | null>(
        "lsp_request",
        {
          sessionId: entry.sessionId,
          method: "textDocument/codeAction",
          params: {
            textDocument: { uri: pathToUri(path) },
            range,
            context: only ? { diagnostics: [], only } : { diagnostics: [] },
          },
        },
      );
      if (!Array.isArray(result)) return [];
      // The spec allows (Command | CodeAction)[] — normalize bare Commands
      // (whose `command` field is a string) into the CodeAction shape.
      return result.flatMap((item) => {
        if (!item || typeof item.title !== "string") return [];
        const cmd = (item as { command?: unknown }).command;
        if (typeof cmd === "string") {
          return [
            {
              title: item.title,
              command: {
                title: item.title,
                command: cmd,
                arguments: (item as { arguments?: unknown[] }).arguments,
              },
            } satisfies LspCodeAction,
          ];
        }
        return [item];
      });
    } catch {
      return [];
    }
  }

  /** Fill in a code action's `edit` lazily via codeAction/resolve. */
  async resolveCodeAction(
    entry: SessionEntry,
    action: LspCodeAction,
  ): Promise<LspCodeAction | null> {
    try {
      return await invoke<LspCodeAction | null>("lsp_request", {
        sessionId: entry.sessionId,
        method: "codeAction/resolve",
        params: action,
      });
    } catch {
      return null;
    }
  }

  /**
   * Run a server-side command (a code action without a literal edit). The
   * server applies its effect by sending `workspace/applyEdit` back to us,
   * which the global listener handles.
   */
  async executeCommand(
    entry: SessionEntry,
    command: string,
    args?: unknown[],
  ): Promise<boolean> {
    try {
      await invoke("lsp_request", {
        sessionId: entry.sessionId,
        method: "workspace/executeCommand",
        params: { command, arguments: args ?? [] },
      });
      return true;
    } catch {
      return false;
    }
  }

  onDiagnostics(
    entry: SessionEntry,
    cb: (uri: string, diags: LspDiagnostic[]) => void,
  ): () => void {
    entry.diagnosticsListeners.add(cb);
    return () => entry.diagnosticsListeners.delete(cb);
  }

  stopSession(group: string, workspaceRoot: string): void {
    const key = this.sessionKey(group, workspaceRoot);
    const entry = this.sessions.get(key);
    if (!entry) return;
    entry.unlisten?.();
    void invoke("lsp_stop", { sessionId: entry.sessionId }).catch(() => {});
    this.sessions.delete(key);
  }

  stopAll(): void {
    for (const entry of this.sessions.values()) {
      entry.unlisten?.();
      void invoke("lsp_stop", { sessionId: entry.sessionId }).catch(() => {});
    }
    this.sessions.clear();
  }
}

export const lspClient = new LspClientManager();

/** Resolve URI back to a local path (for go-to-definition navigation). */
export { uriToPath };
