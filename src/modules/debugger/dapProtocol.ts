// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

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

