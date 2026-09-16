import { defineCommand } from "@/platform/ipc";
import { hostIpc } from "@/platform/tauri";

type StartArgs = {
  adapterCmd: string;
  adapterArgs: string[];
  adapterId: string;
};
type RequestArgs = {
  sessionId: number;
  command: string;
  arguments: unknown;
};
type StopArgs = { sessionId: number };

const startCommand = defineCommand<StartArgs, number>("dap_start", "host");
const requestCommand = defineCommand<RequestArgs, unknown>(
  "dap_request",
  "host",
);
const stopCommand = defineCommand<StopArgs, void>("dap_stop", "host");

export function invokeDap(name: "dap_start", args: StartArgs): Promise<number>;
export function invokeDap<Result = unknown>(
  name: "dap_request",
  args: RequestArgs,
): Promise<Result>;
export function invokeDap(name: "dap_stop", args: StopArgs): Promise<void>;
export function invokeDap<Result>(
  name: "dap_start" | "dap_request" | "dap_stop",
  args: StartArgs | RequestArgs | StopArgs,
): Promise<Result | number | void> {
  switch (name) {
    case "dap_start":
      return hostIpc.call(startCommand, args as StartArgs);
    case "dap_request":
      return hostIpc.call(requestCommand, args as RequestArgs) as Promise<Result>;
    case "dap_stop":
      return hostIpc.call(stopCommand, args as StopArgs);
  }
}
