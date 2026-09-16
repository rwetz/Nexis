import { defineCommand } from "@/platform/ipc";
import { hostIpc } from "@/platform/tauri";

const lanIpCommand = defineCommand<Record<string, never>, string | null>("http_share_lan_ip", "host");
const startCommand = defineCommand<
  { html: string; port: number; bind: string; token: string },
  number
>("http_share_start", "host");
const updateCommand = defineCommand<{ html: string }, void>("http_share_update", "host");
const pushCommand = defineCommand<{ data: string }, void>("http_share_push_stream", "host");
const stopCommand = defineCommand<Record<string, never>, void>("http_share_stop", "host");

export const shareServer = {
  lanIp: () => hostIpc.call(lanIpCommand, {}),
  start: (args: { html: string; port: number; bind: string; token: string }) =>
    hostIpc.call(startCommand, args),
  update: (html: string) => hostIpc.call(updateCommand, { html }),
  pushStream: (data: string) => hostIpc.call(pushCommand, { data }),
  stop: () => hostIpc.call(stopCommand, {}),
};
