// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

export {
  currentWorkspaceScopeKey,
  currentWorkspaceEnv,
  getWslHome,
  LOCAL_WORKSPACE,
  useWorkspaceEnvStore,
  workspaceEnvForPath,
  workspaceScopeKey,
  type WorkspaceEnv,
  type WslDistro,
  activeWorkspace,
  workspaceCurrentDir,
  workspaceWithRoots,
  workspaceIpc,
  ipcForEnvironment,
} from "./workspace-state";

export { sameProject, workspaceProjectKey } from "./workspace-identity";
