import type { WorkspaceContext } from "./workspace";

export type ProcessResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
};
export type ProcessRunOptions = { cwd?: string | null; timeoutSecs?: number };
export interface ProcessSession<Result = ProcessResult> {
  run(command: string, options?: ProcessRunOptions): Promise<Result>;
  close(): Promise<void>;
}
export interface ProcessService<Result = ProcessResult> {
  /** Non-PTY sessions only; native construction stays in Rust proc::command. */
  open(cwd?: string | null): Promise<ProcessSession<Result>>;
}

export function createProcessService<Result = ProcessResult>(
  workspace: WorkspaceContext,
  open: (
    cwd: string | null,
    snapshot: ReturnType<WorkspaceContext["snapshot"]>,
  ) => Promise<ProcessSession<Result>>,
): ProcessService<Result> {
  return {
    async open(cwd) {
      const snapshot = workspace.snapshot();
      if (cwd) await workspace.authorize(cwd, snapshot.environment);
      const session = await open(cwd ?? null, snapshot);
      let closing: Promise<void> | undefined;
      let tail: Promise<unknown> = Promise.resolve();
      return {
        run(command, options) {
          if (closing)
            return Promise.reject(new Error("Process session is closed"));
          const pending = tail.then(() => {
            if (closing) throw new Error("Process session is closed");
            return session.run(command, options);
          });
          tail = pending.catch(() => {});
          return pending;
        },
        close() {
          // Closing cancels the native session promptly, even during a run.
          closing ??= Promise.resolve().then(() => session.close());
          return closing;
        },
      };
    },
  };
}
