import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { createPlatformIpc, type PlatformTransport } from "./ipc";

/** The native transport has no workspace or capability policy of its own. */
export const tauriTransport: PlatformTransport = {
  invoke: (name, args) => invoke(name, args),
  listen: <Payload>(name: string, receive: (payload: Payload) => void) =>
    listen<Payload>(name, (event) => receive(event.payload)),
  emit: (name, payload) => emit(name, payload),
};

/** Host-only services cannot accidentally execute a workspace command. */
export const hostIpc = createPlatformIpc(tauriTransport);
