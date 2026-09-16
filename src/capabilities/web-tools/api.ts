import { defineCommand } from "@/platform/ipc";
import { hostIpc } from "@/platform/tauri";

export type ClientHttpResponse = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: number[];
  elapsedMs: number;
  finalUrl: string;
};

const sendCommand = defineCommand<
  {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: number[] | null;
    timeoutMs: number;
  },
  ClientHttpResponse
>("http_send", "host");

export const webHttp = {
  send: (args: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: number[] | null;
    timeoutMs: number;
  }) => hostIpc.call(sendCommand, args),
};
