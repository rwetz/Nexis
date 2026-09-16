import { defineCommand } from "./ipc";
import { hostIpc } from "./tauri";

const diagnosticsExport = defineCommand<{ sanitizedConfig: string }, string>("diagnostics_export", "host");
const auditLogPath = defineCommand<Record<string, never>, string>("ai_audit_log_path", "host");
const lmPing = defineCommand<{ baseUrl: string }, number>("lm_ping", "host");

export const settingsNative = {
  exportDiagnostics: (sanitizedConfig: string) => hostIpc.call(diagnosticsExport, { sanitizedConfig }),
  auditLogPath: () => hostIpc.call(auditLogPath, {}),
  pingLocalModel: (baseUrl: string) => hostIpc.call(lmPing, { baseUrl }),
};
