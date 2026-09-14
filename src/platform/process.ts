import type { WorkspaceContext } from "./workspace";

export type ProcessResult = { stdout: string; stderr: string; exitCode: number | null };
export interface ProcessSession {
  run(command: string): Promise<ProcessResult>;
  close(): Promise<void>;
}
export interface ProcessService {
  /** Non-PTY sessions only; native construction stays in Rust proc::command. */
  open(cwd: string): Promise<ProcessSession>;
}

export function createProcessService(
  workspace: WorkspaceContext,
  open: (cwd: string, snapshot: ReturnType<WorkspaceContext["snapshot"]>) => Promise<ProcessSession>,
): ProcessService {
  return {
    async open(cwd) {
      const snapshot = workspace.snapshot();
      await workspace.authorize(cwd, snapshot.environment);
      const session = await open(cwd, snapshot);
      let closing: Promise<void> | undefined;
      let tail: Promise<unknown> = Promise.resolve();
      return {
        run(command) {
          if (closing) return Promise.reject(new Error("Process session is closed"));
          const pending = tail.then(() => {
            if (closing) throw new Error("Process session is closed");
            return session.run(command);
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
