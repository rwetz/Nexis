import { defineCommand, defineEvent, type PlatformIpc } from "@/platform/ipc";
import { hostIpc } from "@/platform/tauri";

export type EngineDetectResult = { exe: string; version: string };
export type EnginePin = {
  version: string;
  url: string;
  sizeBytes: number;
  sha256: string;
};
export type ManagedEngineStatus = {
  installed: boolean;
  path: string;
  sizeBytes: number;
};
export type ProtoPayload = { sid: number; lines: string[] };
export type StderrPayload = { sid: number; line: string };
export type ExitPayload = { sid: number; code: number | null };

const detectCommand = defineCommand<{ candidates: string[] }, EngineDetectResult>("ml_detect", "workspace");
const envCommand = defineCommand<{ exe: string }, string>("ml_env", "workspace");
const spawnCommand = defineCommand<
  { exe: string; args: string[]; projectDir: string },
  number
>("ml_spawn", "workspace");
const installCommand = defineCommand<
  { python: string; flavor: string },
  number
>("ml_install", "workspace");

const pinCommand = defineCommand<Record<string, never>, EnginePin | null>("ml_engine_pin", "host");
const downloadCommand = defineCommand<Record<string, never>, EngineDetectResult>("ml_download", "host");
const installLocalCommand = defineCommand<{ path: string }, EngineDetectResult>("ml_install_local", "host");
const statusCommand = defineCommand<Record<string, never>, ManagedEngineStatus>("ml_engine_status", "host");
const uninstallCommand = defineCommand<Record<string, never>, number>("ml_uninstall", "host");
const gpuProbeCommand = defineCommand<Record<string, never>, string | null>("ml_gpu_probe", "host");
const stdinCommand = defineCommand<{ sid: number; line: string }, void>("ml_stdin", "host");
const cancelCommand = defineCommand<{ sid: number }, void>("ml_cancel", "host");
const killCommand = defineCommand<{ sid: number }, void>("ml_kill", "host");

export function createMlWorkspaceApi(ipc: PlatformIpc) {
  return {
    detect: (candidates: string[]) => ipc.call(detectCommand, { candidates }),
    environment: (exe: string) => ipc.call(envCommand, { exe }),
    spawn: (exe: string, args: string[], projectDir: string) =>
      ipc.call(spawnCommand, { exe, args, projectDir }),
    install: (python: string, flavor: string) =>
      ipc.call(installCommand, { python, flavor }),
  };
}

export const mlHost = {
  installPin: () => hostIpc.call(pinCommand, {}),
  download: () => hostIpc.call(downloadCommand, {}),
  installLocal: (path: string) => hostIpc.call(installLocalCommand, { path }),
  status: () => hostIpc.call(statusCommand, {}),
  uninstall: () => hostIpc.call(uninstallCommand, {}),
  probeGpu: () => hostIpc.call(gpuProbeCommand, {}),
  stdin: (sid: number, line: string) => hostIpc.call(stdinCommand, { sid, line }),
  cancel: (sid: number) => hostIpc.call(cancelCommand, { sid }),
  kill: (sid: number) => hostIpc.call(killCommand, { sid }),
};

const protoEvent = defineEvent<ProtoPayload>("ml:proto");
const stderrEvent = defineEvent<StderrPayload>("ml:stderr");
const exitEvent = defineEvent<ExitPayload>("ml:exit");

export function subscribeMlProtocol(handlers: {
  onProto: (payload: ProtoPayload) => void;
  onStderr: (payload: StderrPayload) => void;
  onExit: (payload: ExitPayload) => void;
}): () => void {
  const events = hostIpc.events();
  void events.listen(protoEvent, handlers.onProto).catch(() => {});
  void events.listen(stderrEvent, handlers.onStderr).catch(() => {});
  void events.listen(exitEvent, handlers.onExit).catch(() => {});
  return () => events.dispose();
}
