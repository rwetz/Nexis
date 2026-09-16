export type WorkspaceEnvironment =
  | { kind: "local" }
  | { kind: "wsl"; distro: string };

export type WorkspaceSnapshot = {
  environment: WorkspaceEnvironment;
  roots: readonly string[];
  /** Environment identity, distinct from the active root set. */
  environmentId: string;
  scopeId: string;
};

export interface WorkspaceContext {
  snapshot(): WorkspaceSnapshot;
  /** Authorization returns the canonical host path; the caller retains its
   * original Linux path for any WSL child or command payload. */
  authorize(path: string, environment?: WorkspaceEnvironment): Promise<string>;
}

export function environmentIdentity(environment: WorkspaceEnvironment): string {
  return environment.kind === "wsl" ? `wsl:${environment.distro}` : "local";
}

export function createWorkspaceContext(
  current: () => {
    environment: WorkspaceEnvironment;
    roots: readonly string[];
  },
  authorize: (
    path: string,
    environment: WorkspaceEnvironment,
  ) => Promise<string>,
): WorkspaceContext {
  return {
    snapshot() {
      const currentValue = current();
      const environment = { ...currentValue.environment };
      const roots = [...new Set(currentValue.roots)].sort();
      const environmentId = environmentIdentity(environment);
      return {
        environment,
        roots,
        environmentId,
        scopeId: JSON.stringify([environmentId, roots]),
      };
    },
    authorize(path, environment) {
      if (!path.trim())
        return Promise.reject(new Error("Workspace path must not be empty"));
      return authorize(path, environment ?? { ...current().environment });
    },
  };
}
