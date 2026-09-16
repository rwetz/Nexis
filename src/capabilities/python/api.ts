import { defineCommand } from "@/platform/ipc";
import { workspaceIpc } from "@/platform/workspaces";

export type PythonEnv = {
  name: string;
  path: string;
  python_path: string;
  kind: "venv" | "conda" | "system";
  version: string | null;
};

const detectEnvsCommand = defineCommand<
  { workspaceRoot: string },
  PythonEnv[]
>("py_detect_envs", "workspace");

export const python = {
  detectEnvs: (workspaceRoot: string) =>
    workspaceIpc.call(detectEnvsCommand, { workspaceRoot }),
};
