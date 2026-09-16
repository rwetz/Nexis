import { defineCommand } from "@/platform/ipc";
import { hostIpc } from "@/platform/tauri";

const startCommand = defineCommand<{
  serverCmd: string;
  serverArgs: string[];
  workspaceRoot: string;
  initializationOptions: unknown | null;
}, number>("lsp_start", "host");
const requestCommand = defineCommand<{
  sessionId: number;
  method: string;
  params: unknown;
}, unknown>("lsp_request", "host");
const notifyCommand = defineCommand<{
  sessionId: number;
  method: string;
  params: unknown;
}, void>("lsp_notify", "host");
const stopCommand = defineCommand<{ sessionId: number }, void>(
  "lsp_stop",
  "host",
);

export const lsp = {
  start: (args: {
    serverCmd: string;
    serverArgs: string[];
    workspaceRoot: string;
    initializationOptions: unknown | null;
  }) => hostIpc.call(startCommand, args),
  request: <Result>(sessionId: number, method: string, params: unknown) =>
    hostIpc.call(requestCommand, { sessionId, method, params }) as Promise<Result>,
  notify: (sessionId: number, method: string, params: unknown) =>
    hostIpc.call(notifyCommand, { sessionId, method, params }),
  stop: (sessionId: number) => hostIpc.call(stopCommand, { sessionId }),
};
