import { Channel } from "@tauri-apps/api/core";
import { defineCommand } from "./ipc";
import { hostIpc } from "./tauri";

export type HttpStreamEvent =
  | { kind: "headers"; status: number; headers: Record<string, string> }
  | { kind: "chunk"; bytes: number[] }
  | { kind: "end" }
  | { kind: "error"; message: string };

export type HttpStreamRequest = {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: number[];
  allowPrivateNetwork: boolean;
};

const streamHttp = defineCommand<
  HttpStreamRequest & { onEvent: Channel<HttpStreamEvent> },
  void
>("ai_http_stream", "host");

/** Keep Tauri's callback channel inside the platform boundary. */
export function startHttpStream(
  request: HttpStreamRequest,
  receive: (event: HttpStreamEvent) => void,
): Promise<void> {
  const onEvent = new Channel<HttpStreamEvent>();
  onEvent.onmessage = receive;
  return hostIpc.call(streamHttp, { ...request, onEvent });
}
