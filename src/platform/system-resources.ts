import { hostIpc } from "@/platform/tauri";
import { defineCommand } from "@/platform/ipc";
import type {
  SysmonSort,
  SysmonSignal,
  SysSample,
} from "@/domain/native-types";

export const systemResources = {
  sysmonSample: (sort?: SysmonSort, includeProcesses?: boolean) =>
    hostIpc.call(
      defineCommand<
        { sort: SysmonSort | null; includeProcesses: boolean | null },
        SysSample
      >("sysmon_sample", "host"),
      {
        sort: sort ?? null,
        includeProcesses: includeProcesses ?? null,
      },
    ),
  sysmonKill: (pid: number, signal?: SysmonSignal) =>
    hostIpc.call(
      defineCommand<{ pid: number; signal: SysmonSignal | null }, boolean>(
        "sysmon_kill",
        "host",
      ),
      { pid, signal: signal ?? null },
    ),
};
