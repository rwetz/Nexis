// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { create } from "zustand";
import type {
  DapOutputEvent,
  DapScope,
  DapStackFrame,
  DapStoppedEvent,
  DapThread,
  DapVariable,
} from "./dapProtocol";

export type DebugStatus =
  | "idle"
  | "starting"
  | "running"
  | "stopped"
  | "terminated";

export type DebugOutput = {
  id: string;
  category: string;
  text: string;
};

type DebugSessionState = {
  sessionId: number | null;
  status: DebugStatus;
  stoppedReason: string | null;
  activeThreadId: number | null;
  threads: DapThread[];
  stackFrames: DapStackFrame[];
  activeFrameId: number | null;
  scopes: DapScope[];
  variables: Map<number, DapVariable[]>; // variablesRef → children
  output: DebugOutput[];
  unlisteners: UnlistenFn[];
  /** Path of the currently-executing line (set when stopped). */
  currentPath: string | null;
  currentLine: number | null;
};

type DebugSessionActions = {
  start: (
    adapterCmd: string,
    adapterArgs: string[],
    adapterId: string,
    launchConfig: Record<string, unknown>,
    breakpoints: Map<string, number[]>,
  ) => Promise<void>;
  stop: () => Promise<void>;
  continue: () => Promise<void>;
  next: () => Promise<void>;
  stepIn: () => Promise<void>;
  stepOut: () => Promise<void>;
  pause: () => Promise<void>;
  selectFrame: (frameId: number) => Promise<void>;
  expandVariables: (variablesRef: number) => Promise<void>;
  evaluate: (expression: string) => Promise<string>;
  addOutput: (category: string, text: string) => void;
  reset: () => void;
};

const initialState: DebugSessionState = {
  sessionId: null,
  status: "idle",
  stoppedReason: null,
  activeThreadId: null,
  threads: [],
  stackFrames: [],
  activeFrameId: null,
  scopes: [],
  variables: new Map(),
  output: [],
  unlisteners: [],
  currentPath: null,
  currentLine: null,
};

export const useDebugStore = create<DebugSessionState & DebugSessionActions>(
  (set, get) => ({
    ...initialState,

    async start(adapterCmd, adapterArgs, adapterId, launchConfig, breakpoints) {
      set({ status: "starting", output: [], stackFrames: [], scopes: [], variables: new Map() });

      try {
        const sessionId = await invoke<number>("dap_start", {
          adapterCmd,
          adapterArgs,
          adapterId,
        });
        set({ sessionId });

        // Subscribe to DAP events
        const unlisteners: UnlistenFn[] = [];

        unlisteners.push(
          await listen<{ sessionId: number; body: DapStoppedEvent }>(
            "dap:stopped",
            async (e) => {
              if (e.payload.sessionId !== sessionId) return;
              const body = e.payload.body;
              const threadId = body.threadId ?? get().activeThreadId;
              set({
                status: "stopped",
                stoppedReason: body.reason,
                activeThreadId: threadId,
              });
              if (threadId != null) {
                await get().selectFrame(-1);
              }
            },
          ),
        );

        unlisteners.push(
          await listen<{ sessionId: number; body: unknown }>(
            "dap:continued",
            (e) => {
              if (e.payload.sessionId !== sessionId) return;
              set({ status: "running", stoppedReason: null, currentPath: null, currentLine: null });
            },
          ),
        );

        unlisteners.push(
          await listen<{ sessionId: number; body: DapOutputEvent }>(
            "dap:output",
            (e) => {
              if (e.payload.sessionId !== sessionId) return;
              const b = e.payload.body;
              get().addOutput(b.category ?? "console", b.output);
            },
          ),
        );

        unlisteners.push(
          await listen<{ sessionId: number; body: unknown }>(
            "dap:terminated",
            (e) => {
              if (e.payload.sessionId !== sessionId) return;
              set({ status: "terminated", currentPath: null, currentLine: null });
            },
          ),
        );

        unlisteners.push(
          await listen<{ sessionId: number; body: { threadId: number; startDebugging?: boolean } }>(
            "dap:thread",
            async (e) => {
              if (e.payload.sessionId !== sessionId) return;
            },
          ),
        );

        set({ unlisteners });

        // Set breakpoints for each file
        for (const [path, lines] of breakpoints) {
          await invoke("dap_request", {
            sessionId,
            command: "setBreakpoints",
            arguments: {
              source: { path },
              breakpoints: lines.map((l) => ({ line: l })),
            },
          });
        }

        // Launch
        await invoke("dap_request", {
          sessionId,
          command: "launch",
          arguments: launchConfig,
        });

        // configurationDone
        await invoke("dap_request", {
          sessionId,
          command: "configurationDone",
          arguments: {},
        });

        set({ status: "running" });
      } catch (e) {
        set({ status: "idle" });
        throw e;
      }
    },

    async stop() {
      const { sessionId, unlisteners } = get();
      for (const u of unlisteners) u();
      if (sessionId != null) {
        try {
          await invoke("dap_request", { sessionId, command: "disconnect", arguments: { terminateDebuggee: true } });
        } catch {}
        await invoke("dap_stop", { sessionId }).catch(() => {});
      }
      set({ ...initialState });
    },

    async continue() {
      const { sessionId, activeThreadId } = get();
      if (!sessionId || activeThreadId == null) return;
      await invoke("dap_request", {
        sessionId,
        command: "continue",
        arguments: { threadId: activeThreadId },
      });
      set({ status: "running" });
    },

    async next() {
      const { sessionId, activeThreadId } = get();
      if (!sessionId || activeThreadId == null) return;
      await invoke("dap_request", {
        sessionId,
        command: "next",
        arguments: { threadId: activeThreadId, granularity: "statement" },
      });
      set({ status: "running" });
    },

    async stepIn() {
      const { sessionId, activeThreadId } = get();
      if (!sessionId || activeThreadId == null) return;
      await invoke("dap_request", {
        sessionId,
        command: "stepIn",
        arguments: { threadId: activeThreadId, granularity: "statement" },
      });
      set({ status: "running" });
    },

    async stepOut() {
      const { sessionId, activeThreadId } = get();
      if (!sessionId || activeThreadId == null) return;
      await invoke("dap_request", {
        sessionId,
        command: "stepOut",
        arguments: { threadId: activeThreadId },
      });
      set({ status: "running" });
    },

    async pause() {
      const { sessionId, activeThreadId } = get();
      if (!sessionId || activeThreadId == null) return;
      await invoke("dap_request", {
        sessionId,
        command: "pause",
        arguments: { threadId: activeThreadId },
      });
    },

    async selectFrame(frameId: number) {
      const { sessionId, activeThreadId, stackFrames } = get();
      if (!sessionId || activeThreadId == null) return;

      // If frameId === -1, fetch stack trace first
      let frames = stackFrames;
      if (frameId === -1) {
        const result = await invoke<{ stackFrames: DapStackFrame[] }>("dap_request", {
          sessionId,
          command: "stackTrace",
          arguments: { threadId: activeThreadId },
        }).catch(() => null);
        frames = result?.stackFrames ?? [];
        set({ stackFrames: frames, activeFrameId: frames[0]?.id ?? null });
        frameId = frames[0]?.id ?? -1;

        // Update current file/line from top frame
        const topFrame = frames[0];
        if (topFrame?.source?.path) {
          set({ currentPath: topFrame.source.path, currentLine: topFrame.line });
        }
      } else {
        set({ activeFrameId: frameId });
        const frame = frames.find((f) => f.id === frameId);
        if (frame?.source?.path) {
          set({ currentPath: frame.source.path, currentLine: frame.line });
        }
      }

      if (frameId === -1) return;

      // Fetch scopes
      const scopesResult = await invoke<{ scopes: DapScope[] }>("dap_request", {
        sessionId,
        command: "scopes",
        arguments: { frameId },
      }).catch(() => null);

      const scopes = scopesResult?.scopes ?? [];
      set({ scopes, variables: new Map() });

      // Eagerly expand non-expensive scopes
      for (const scope of scopes) {
        if (!scope.expensive) {
          await get().expandVariables(scope.variablesReference);
        }
      }
    },

    async expandVariables(variablesRef: number) {
      const { sessionId, variables } = get();
      if (!sessionId || variables.has(variablesRef)) return;
      const result = await invoke<{ variables: DapVariable[] }>("dap_request", {
        sessionId,
        command: "variables",
        arguments: { variablesReference: variablesRef },
      }).catch(() => null);
      const vars = result?.variables ?? [];
      set((s) => {
        const next = new Map(s.variables);
        next.set(variablesRef, vars);
        return { variables: next };
      });
    },

    async evaluate(expression: string): Promise<string> {
      const { sessionId, activeFrameId } = get();
      if (!sessionId) return "No active session";
      try {
        const result = await invoke<{ result: string }>("dap_request", {
          sessionId,
          command: "evaluate",
          arguments: { expression, frameId: activeFrameId, context: "repl" },
        });
        return result.result ?? "";
      } catch (e) {
        return String(e);
      }
    },

    addOutput(category, text) {
      const entry: DebugOutput = {
        id: `${Date.now()}-${Math.random()}`,
        category,
        text,
      };
      set((s) => ({ output: [...s.output.slice(-499), entry] }));
    },

    reset() {
      const { unlisteners } = get();
      for (const u of unlisteners) u();
      set({ ...initialState });
    },
  }),
);
