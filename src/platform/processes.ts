import { hostIpc } from "@/platform/tauri";
import {
  activeWorkspace,
  ipcForEnvironment,
  workspaceIpc,
} from "@/platform/workspaces";
import { defineCommand } from "@/platform/ipc";
import { createProcessService } from "./process";

import type { CommandOutput } from "@/domain/native-types";

export type ShellRunResult = CommandOutput & { cwd_after: string };
const openSession = defineCommand<{ cwd: string | null }, number>(
  "shell_session_open",
  "workspace",
);
const runSession = defineCommand<
  {
    id: number;
    command: string;
    cwd: string | null;
    timeoutSecs: number | null;
  },
  ShellRunResult
>("shell_session_run", "workspace");
const closeSession = defineCommand<{ id: number }, void>(
  "shell_session_close",
  "host",
);

export const shellSessions = createProcessService<ShellRunResult>(
  activeWorkspace,
  async (cwd, snapshot) => {
    const ipc = ipcForEnvironment(snapshot.environment);
    const id = await ipc.call(openSession, { cwd });
    return {
      run: (command, options) =>
        ipc.call(runSession, {
          id,
          command,
          cwd: options?.cwd ?? null,
          timeoutSecs: options?.timeoutSecs ?? null,
        }),
      close: () => hostIpc.call(closeSession, { id }),
    };
  },
);

export const processes = {
  runCommand: (command: string, cwd?: string | null, timeoutSecs?: number) =>
    workspaceIpc.call(
      defineCommand<
        { command: string; cwd: string | null; timeoutSecs: number | null },
        CommandOutput
      >("shell_run_command", "workspace"),
      { command, cwd: cwd ?? null, timeoutSecs: timeoutSecs ?? null },
    ),
  shellBgSpawn: (command: string, cwd?: string | null) =>
    workspaceIpc.call(
      defineCommand<{ command: string; cwd: string | null }, number>(
        "shell_bg_spawn",
        "workspace",
      ),
      { command, cwd: cwd ?? null },
    ),
  shellBgLogs: (handle: number, sinceOffset?: number) =>
    hostIpc.call(
      defineCommand<
        { handle: number; sinceOffset: number | null },
        {
          bytes: string;
          next_offset: number;
          dropped: number;
          exited: boolean;
          exit_code: number | null;
        }
      >("shell_bg_logs", "host"),
      { handle, sinceOffset: sinceOffset ?? null },
    ),
  shellBgKill: (handle: number) =>
    hostIpc.call(
      defineCommand<{ handle: number }, void>("shell_bg_kill", "host"),
      { handle },
    ),
  shellBgList: () =>
    hostIpc.call(
      defineCommand<
        Record<string, never>,
        {
          handle: number;
          command: string;
          cwd: string | null;
          started_at_ms: number;
          exited: boolean;
          exit_code: number | null;
        }[]
      >("shell_bg_list", "host"),
      {},
    ),
};
