// Subset of Debug Adapter Protocol 1.65 types used by the frontend.

export type DapSource = {
  name?: string;
  path?: string;
  sourceReference?: number;
};

export type DapStackFrame = {
  id: number;
  name: string;
  source?: DapSource;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
};

export type DapScope = {
  name: string;
  variablesReference: number;
  expensive: boolean;
  namedVariables?: number;
  indexedVariables?: number;
};

export type DapVariable = {
  name: string;
  value: string;
  type?: string;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
  evaluateName?: string;
};

export type DapBreakpoint = {
  id?: number;
  verified: boolean;
  message?: string;
  source?: DapSource;
  line?: number;
};

export type DapThread = {
  id: number;
  name: string;
};

export type DapOutputCategory = "console" | "stdout" | "stderr" | "telemetry" | string;

export type DapOutputEvent = {
  category?: DapOutputCategory;
  output: string;
  source?: DapSource;
  line?: number;
};

export type DapStoppedEvent = {
  reason: string;
  description?: string;
  threadId?: number;
  allThreadsStopped?: boolean;
  hitBreakpointIds?: number[];
};

export type DapStoppedReason =
  | "breakpoint"
  | "step"
  | "exception"
  | "pause"
  | "entry"
  | "goto"
  | "function breakpoint"
  | string;

/** Well-known adapter configurations bundled with Nexis. */
export type AdapterConfig = {
  name: string;
  command: string;
  args: string[];
  adapterId: string;
  launchTemplate: (opts: LaunchOpts) => Record<string, unknown>;
};

export type LaunchOpts = {
  program: string;
  cwd?: string;
  args?: string[];
  env?: Record<string, string>;
  stopOnEntry?: boolean;
};

export const ADAPTERS: Record<string, AdapterConfig> = {
  node: {
    name: "Node.js",
    command: "node",
    args: [],
    adapterId: "pwa-node",
    launchTemplate: (o) => ({
      type: "pwa-node",
      request: "launch",
      name: "Launch Node.js",
      program: o.program,
      cwd: o.cwd,
      args: o.args ?? [],
      env: o.env,
      stopOnEntry: o.stopOnEntry ?? false,
      console: "integratedTerminal",
      internalConsoleOptions: "neverOpen",
    }),
  },
  python: {
    name: "Python",
    command: "python3",
    args: ["-m", "debugpy", "--listen", "0.0.0.0:5678", "--wait-for-client"],
    adapterId: "debugpy",
    launchTemplate: (o) => ({
      type: "debugpy",
      request: "launch",
      name: "Launch Python",
      program: o.program,
      cwd: o.cwd,
      args: o.args ?? [],
      env: o.env,
      stopOnEntry: o.stopOnEntry ?? false,
      console: "integratedTerminal",
      justMyCode: true,
    }),
  },
  "lldb-vscode": {
    name: "LLDB (Rust / C / C++)",
    command: "lldb-vscode",
    args: [],
    adapterId: "lldb",
    launchTemplate: (o) => ({
      type: "lldb",
      request: "launch",
      name: "Launch LLDB",
      program: o.program,
      cwd: o.cwd,
      args: o.args ?? [],
      env: o.env,
      stopOnEntry: o.stopOnEntry ?? false,
    }),
  },
};
